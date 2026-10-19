import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, type KieuSo } from "@/lib/so-chung-tu";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { congNo, dong, nhomTuoiNo, soNgayQuaHan, tongHopTuoiNo } from "@/modules/tai-chinh/tinh-toan";
import { tinhDonMua } from "@/modules/mua-hang/tinh-toan";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import type {
  BoLocHoaDonMua,
  BoLocPhieuChi,
  DuLieuChiTien,
  DuLieuGhiNhanHoaDonMua,
  DuLieuTaoHoaDonMua,
} from "./luoc-do";

/**
 * Công nợ phải trả: hóa đơn nhà cung cấp và phiếu chi.
 *
 * Đối xứng với Phase 7 (hóa đơn bán ra, phiếu thu) và **dùng chung đúng những hàm thuần
 * đó**: `congNo()`, `nhomTuoiNo()`, `tongHopTuoiNo()`. Một công thức cho cả hai chiều nợ,
 * nên phải thu và phải trả không bao giờ tính theo hai kiểu khác nhau.
 *
 * Công nợ **không lưu thành cột**: còn phải trả = hóa đơn đã ghi nhận trừ tiền đã chi
 * (QĐ-09, CT-06).
 */

const KIEU_SO_HOA_DON: KieuSo = { loai: "supplier_bill", tienTo: "HM", doDai: 4, theoNam: true };
const KIEU_SO_PHIEU_CHI: KieuSo = { loai: "supplier_payment", tienTo: "PC", doDai: 4, theoNam: true };

/** Trạng thái mà hóa đơn nhà cung cấp bắt đầu sinh nợ phải trả. */
const TRANG_THAI_TINH_NO = "RECORDED";

export const NHAN_TRANG_THAI_HOA_DON_MUA: Record<string, { nhan: string; lop: string }> = {
  DRAFT: { nhan: "Nháp", lop: "" },
  RECORDED: { nhan: "Đã ghi nhận", lop: "tot" },
  CANCELLED: { nhan: "Đã hủy", lop: "loi" },
};

export const NHAN_TINH_TRANG_TRA: Record<string, string> = {
  "khong-tinh": "Chưa tính nợ",
  "chua-thu": "Chưa trả",
  "thu-mot-phan": "Trả một phần",
  "da-thu-du": "Đã trả đủ",
};

const CHON = {
  id: true, number: true, status: true, supplierDocNo: true, billDate: true, dueDate: true,
  notes: true, subtotal: true, discountTotal: true, vatTotal: true, total: true,
  recordedAt: true, cancelledAt: true, cancelReason: true, ownerId: true, createdAt: true,
  supplier: { select: { id: true, code: true, name: true, taxCode: true } },
  purchaseOrder: { select: { id: true, number: true } },
  owner: { select: { id: true, fullName: true } },
  items: {
    orderBy: { lineNo: "asc" },
    select: {
      id: true, lineNo: true, productId: true, sku: true, name: true, quantity: true,
      unit: true, unitPrice: true, discountPct: true, vatRate: true, lineTotal: true,
      orderItem: { select: { id: true, quantity: true, receivedQty: true } },
    },
  },
  allocations: {
    select: {
      amount: true,
      payment: { select: { id: true, number: true, paidAt: true, method: true, status: true } },
    },
  },
  returnAllocations: {
    select: {
      amount: true,
      purchaseReturn: { select: { id: true, number: true, status: true, returnDate: true } },
    },
  },
} satisfies Prisma.SupplierBillSelect;

type BanGhi = Prisma.SupplierBillGetPayload<{ select: typeof CHON }>;

function daTraCua(hd: { allocations: { amount: Prisma.Decimal; payment: { status: string } }[] }): number {
  return hd.allocations.filter((a) => a.payment.status === "hoat-dong").reduce((s, a) => s + Number(a.amount), 0);
}

/** Phần nợ phải trả đã bị xóa bằng hàng trả lại nhà cung cấp (TH-07). */
function daGiamTruCua(hd: { returnAllocations: { amount: Prisma.Decimal; purchaseReturn: { status: string } }[] }): number {
  return hd.returnAllocations.filter((a) => a.purchaseReturn.status === "SETTLED").reduce((s, a) => s + Number(a.amount), 0);
}

/** Các phiếu trả nhà cung cấp đã chốt tiền vào hóa đơn này (TV-TC-03). */
function phieuTraDaChotCua(hd: { returnAllocations: { purchaseReturn: { status: string; number: string } }[] }): string[] {
  return [...new Set(hd.returnAllocations.filter((a) => a.purchaseReturn.status === "SETTLED").map((a) => a.purchaseReturn.number))];
}

function hoaDonRa(hd: BanGhi, homNay: string) {
  const daTra = daTraCua(hd);
  const cn = congNo(hd.status, hd.total.toString(), daTra, { trangThaiTinh: TRANG_THAI_TINH_NO, daGiamTru: daGiamTruCua(hd) });
  const han = dateVeNgay(hd.dueDate) || null;
  const quaHan = hd.status === TRANG_THAI_TINH_NO && cn.conNo > 0 ? soNgayQuaHan(han, homNay) : 0;
  return {
    id: hd.id,
    so: hd.number,
    soHoaDonNcc: hd.supplierDocNo,
    trangThai: hd.status,
    ngayHoaDon: hd.billDate,
    hanThanhToan: hd.dueDate,
    ghiChu: hd.notes,
    tamTinh: hd.subtotal.toString(),
    tongChietKhau: hd.discountTotal.toString(),
    tongVat: hd.vatTotal.toString(),
    tongCong: hd.total.toString(),
    daTra: cn.daThu,
    daGiamTru: cn.daGiamTru,
    conNo: cn.conNo,
    tinhTrangTra: cn.tinhTrang,
    soNgayQuaHan: quaHan,
    nhomTuoiNo: cn.conNo > 0 ? nhomTuoiNo(quaHan) : "trong-han",
    ghiNhanLuc: hd.recordedAt,
    huyLuc: hd.cancelledAt,
    lyDoHuy: hd.cancelReason,
    nhaCungCap: { id: hd.supplier.id, ma: hd.supplier.code, ten: hd.supplier.name, maSoThue: hd.supplier.taxCode },
    donMua: hd.purchaseOrder ? { id: hd.purchaseOrder.id, so: hd.purchaseOrder.number } : null,
    nguoiPhuTrach: { id: hd.owner.id, hoTen: hd.owner.fullName },
    dong: hd.items.map((d) => ({
      id: d.id,
      thuTu: d.lineNo,
      sanPhamId: d.productId,
      sku: d.sku,
      ten: d.name,
      soLuong: d.quantity.toString(),
      donViTinh: d.unit,
      donGia: d.unitPrice.toString(),
      chietKhau: d.discountPct.toString(),
      vat: d.vatRate.toString(),
      thanhTien: d.lineTotal.toString(),
      // Đối chiếu ba chiều: đơn đặt bao nhiêu, đã nhận bao nhiêu, hóa đơn đòi bao nhiêu.
      datTrenDon: d.orderItem ? d.orderItem.quantity.toString() : null,
      daNhan: d.orderItem ? d.orderItem.receivedQty.toString() : null,
      lechVoiNhan: d.orderItem ? Number(d.quantity) - Number(d.orderItem.receivedQty) : null,
    })),
    phieuChi: hd.allocations.map((a) => ({
      id: a.payment.id,
      so: a.payment.number,
      ngayChi: a.payment.paidAt,
      phuongThuc: a.payment.method,
      trangThai: a.payment.status,
      soTien: a.amount.toString(),
    })),
    traHang: hd.returnAllocations.map((a) => ({
      id: a.purchaseReturn.id,
      so: a.purchaseReturn.number,
      ngayTra: a.purchaseReturn.returnDate,
      trangThai: a.purchaseReturn.status,
      soTien: a.amount.toString(),
    })),
    taoLuc: hd.createdAt,
  };
}

/** Phạm vi xem hóa đơn nhà cung cấp: theo người phụ trách, quyền `finance.view`. */
export async function dieuKienXemHoaDonMua(nc: NguCanh): Promise<Prisma.SupplierBillWhereInput> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "finance.view");
  if (pv === "tat-ca") return {};
  return { ownerId: { in: pv } };
}

async function docHoaDon(nc: NguCanh, id: string): Promise<BanGhi> {
  const hd = await nc.tx.supplierBill.findFirst({
    where: { AND: [{ id }, await dieuKienXemHoaDonMua(nc)] },
    select: CHON,
  });
  if (!hd) throw new LoiKhongTimThay("Hóa đơn nhà cung cấp");
  return hd;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachHoaDonMua(nc: NguCanh, boLoc: BoLocHoaDonMua) {
  batBuocQuyen(nc.hoSo, "finance.view");
  const homNay = homNayVN();
  const dieuKien: Prisma.SupplierBillWhereInput[] = [await dieuKienXemHoaDonMua(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { supplierDocNo: { contains: boLoc.q, mode: "insensitive" } },
        { supplier: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.nhaCungCap) dieuKien.push({ supplierId: boLoc.nhaCungCap });
  if (boLoc.trangThai === "qua-han") {
    dieuKien.push({ status: TRANG_THAI_TINH_NO, dueDate: { lt: ngayVeDate(homNay) } });
  } else if (boLoc.trangThai === "" ) {
    dieuKien.push({ status: TRANG_THAI_TINH_NO });
  } else if (boLoc.trangThai !== "tat-ca") {
    dieuKien.push({ status: boLoc.trangThai });
  }

  const where: Prisma.SupplierBillWhereInput = { AND: dieuKien };
  const [tong, ds] = await Promise.all([
    nc.tx.supplierBill.count({ where }),
    nc.tx.supplierBill.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
      select: CHON,
    }),
  ]);
  let dongRa = ds.map((hd) => hoaDonRa(hd, homNay));
  // "Còn nợ" là trạng thái TÍNH, không lưu, nên lọc sau khi tính.
  if (boLoc.trangThai === "") dongRa = dongRa.filter((h) => h.conNo > 0);
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: dongRa };
}

export async function chiTietHoaDonMua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "finance.view", { objectType: "supplier_bill", objectId: id });
  const hd = await docHoaDon(nc, id);
  const ra = hoaDonRa(hd, homNayVN());
  const duocGhi = coQuyen(nc.hoSo, "finance.update");
  return {
    hoaDon: ra,
    quyen: {
      sua: duocGhi && ra.trangThai === "DRAFT",
      ghiNhan: coQuyen(nc.hoSo, "finance.approve") && ra.trangThai === "DRAFT" && ra.dong.length > 0,
      huy: coQuyen(nc.hoSo, "finance.approve") && ra.trangThai !== "CANCELLED" && ra.daTra === 0 && ra.daGiamTru === 0,
      chiTien: duocGhi && ra.trangThai === TRANG_THAI_TINH_NO && ra.conNo > 0,
    },
  };
}

/** Công nợ phải trả theo nhà cung cấp, kèm tuổi nợ. Con số TÍNH, không lưu. */
export async function congNoTheoNhaCungCap(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "finance.view");
  const homNay = homNayVN();
  const ds = await nc.tx.supplierBill.findMany({
    where: { AND: [await dieuKienXemHoaDonMua(nc), { status: TRANG_THAI_TINH_NO }] },
    select: {
      id: true, number: true, total: true, dueDate: true, status: true,
      supplier: { select: { id: true, code: true, name: true } },
      allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, purchaseReturn: { select: { status: true } } } },
    },
  });

  const chiTiet = ds.map((hd) => {
    const cn = congNo(hd.status, hd.total.toString(), daTraCua(hd), { trangThaiTinh: TRANG_THAI_TINH_NO, daGiamTru: daGiamTruCua(hd) });
    return {
      nhaCungCap: hd.supplier,
      conNo: cn.conNo,
      soNgayQuaHan: soNgayQuaHan(dateVeNgay(hd.dueDate) || null, homNay),
    };
  });

  const theoNcc = new Map<string, { nhaCungCap: { id: string; ma: string; ten: string }; conNo: number; quaHan: number; soHoaDon: number; quaHanLauNhat: number }>();
  for (const c of chiTiet) {
    if (c.conNo <= 0) continue;
    const cu = theoNcc.get(c.nhaCungCap.id) ?? {
      nhaCungCap: { id: c.nhaCungCap.id, ma: c.nhaCungCap.code, ten: c.nhaCungCap.name },
      conNo: 0,
      quaHan: 0,
      soHoaDon: 0,
      quaHanLauNhat: 0,
    };
    cu.conNo += c.conNo;
    cu.soHoaDon += 1;
    if (c.soNgayQuaHan > 0) {
      cu.quaHan += c.conNo;
      cu.quaHanLauNhat = Math.max(cu.quaHanLauNhat, c.soNgayQuaHan);
    }
    theoNcc.set(c.nhaCungCap.id, cu);
  }

  return {
    tomTat: tongHopTuoiNo(chiTiet),
    nhaCungCap: [...theoNcc.values()].sort((a, b) => b.conNo - a.conNo),
  };
}

/** Hóa đơn còn nợ của một nhà cung cấp — để màn hình chi tiền phân bổ nhanh. */
export async function hoaDonConNoCua(nc: NguCanh, nhaCungCapId: string) {
  batBuocQuyen(nc.hoSo, "finance.view");
  const homNay = homNayVN();
  const ds = await nc.tx.supplierBill.findMany({
    where: { AND: [await dieuKienXemHoaDonMua(nc), { supplierId: nhaCungCapId, status: TRANG_THAI_TINH_NO }] },
    select: {
      id: true, number: true, supplierDocNo: true, total: true, dueDate: true, status: true,
      allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, purchaseReturn: { select: { status: true } } } },
    },
    orderBy: { dueDate: "asc" },
  });
  return ds
    .map((hd) => {
      const cn = congNo(hd.status, hd.total.toString(), daTraCua(hd), { trangThaiTinh: TRANG_THAI_TINH_NO, daGiamTru: daGiamTruCua(hd) });
      return {
        id: hd.id,
        so: hd.number,
        soHoaDonNcc: hd.supplierDocNo,
        tongCong: cn.tong,
        daTra: cn.daThu,
        conNo: cn.conNo,
        hanThanhToan: hd.dueDate,
        soNgayQuaHan: soNgayQuaHan(dateVeNgay(hd.dueDate) || null, homNay),
      };
    })
    .filter((hd) => hd.conNo > 0);
}

export async function danhSachPhieuChi(nc: NguCanh, boLoc: BoLocPhieuChi) {
  batBuocQuyen(nc.hoSo, "finance.view");
  const dieuKien: Prisma.SupplierPaymentWhereInput[] = [];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { reference: { contains: boLoc.q, mode: "insensitive" } },
        { supplier: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.nhaCungCap) dieuKien.push({ supplierId: boLoc.nhaCungCap });
  if (boLoc.tuNgay) dieuKien.push({ paidAt: { gte: ngayVeDate(boLoc.tuNgay) } });
  if (boLoc.denNgay) dieuKien.push({ paidAt: { lte: ngayVeDate(boLoc.denNgay) } });

  const where: Prisma.SupplierPaymentWhereInput = dieuKien.length ? { AND: dieuKien } : {};
  const [tong, ds] = await Promise.all([
    nc.tx.supplierPayment.count({ where }),
    nc.tx.supplierPayment.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
      select: {
        id: true, number: true, method: true, amount: true, paidAt: true, reference: true,
        note: true, status: true, cancelReason: true,
        supplier: { select: { id: true, code: true, name: true } },
        allocations: { select: { amount: true, bill: { select: { id: true, number: true } } } },
      },
    }),
  ]);
  const tongTienChi = ds.filter((p) => p.status === "hoat-dong").reduce((s, p) => s + Number(p.amount), 0);
  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    tongTienChi: dong(tongTienChi),
    dong: ds.map((p) => ({
      id: p.id,
      so: p.number,
      phuongThuc: p.method,
      soTien: p.amount.toString(),
      ngayChi: p.paidAt,
      thamChieu: p.reference,
      ghiChu: p.note,
      trangThai: p.status,
      lyDoHuy: p.cancelReason,
      nhaCungCap: { id: p.supplier.id, ma: p.supplier.code, ten: p.supplier.name },
      phanBo: p.allocations.map((a) => ({ hoaDonId: a.bill.id, soHoaDon: a.bill.number, soTien: a.amount.toString() })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Ghi: hóa đơn nhà cung cấp
// ---------------------------------------------------------------------------

function tongVeCot(t: ReturnType<typeof tinhDonMua>) {
  return {
    subtotal: String(t.tamTinh),
    discountTotal: String(t.tongChietKhau),
    vatTotal: String(t.tongVat),
    total: String(t.tongCong),
  };
}

/**
 * Lập hóa đơn nhà cung cấp. Hai đường: từ **đơn mua** (chép nguyên dòng, giữ liên kết
 * từng dòng để đối chiếu với số đã nhận), hoặc nhập tay cho khoản lẻ (CT-01).
 *
 * Lập từ đơn mua: khóa dòng đơn mua trước khi dò hóa đơn đã có (TV-TC-04); chỉ mục riêng
 * phần `supplier_bills_mot_hieu_luc_moi_don` là chốt cuối ở CSDL (CT-02).
 */
export async function taoHoaDonMua(nc: NguCanh, d: DuLieuTaoHoaDonMua) {
  batBuocQuyen(nc.hoSo, "finance.create", { objectType: "supplier_bill" });

  let nhaCungCapId = d.nhaCungCapId ?? null;
  let donMua: { id: string; number: string } | null = null;
  let dongGhi: Prisma.SupplierBillItemCreateManyBillInput[] = [];
  let tinh: ReturnType<typeof tinhDonMua>;

  if (d.donMuaId) {
    await khoaChungTu(nc.tx, "purchase_orders", d.donMuaId);
    const dm = await nc.tx.purchaseOrder.findFirst({
      where: { id: d.donMuaId },
      select: {
        id: true, number: true, supplierId: true, status: true,
        items: {
          orderBy: { lineNo: "asc" },
          select: {
            id: true, productId: true, sku: true, name: true, quantity: true, unit: true,
            unitPrice: true, discountPct: true, vatRate: true,
          },
        },
      },
    });
    if (!dm) throw new LoiDinhDang("donMuaId", "Không tìm thấy đơn mua.");
    if (dm.status === "DRAFT") throw new LoiNghiepVu("Đơn mua còn nháp — gửi nhà cung cấp trước khi ghi hóa đơn.", 409, "don-con-nhap");
    if (dm.status === "CANCELLED") throw new LoiNghiepVu("Đơn mua đã hủy thì không ghi hóa đơn.", 409, "don-da-huy");
    if (d.nhaCungCapId && d.nhaCungCapId !== dm.supplierId) {
      throw new LoiDinhDang("nhaCungCapId", `Đơn mua ${dm.number} là của nhà cung cấp khác — bỏ chọn nhà cung cấp hoặc chọn đúng đơn.`);
    }

    // CT-02: một đơn mua chỉ có một hóa đơn còn hiệu lực.
    const daCo = await nc.tx.supplierBill.findFirst({
      where: { purchaseOrderId: dm.id, status: { not: "CANCELLED" } },
      select: { id: true, number: true },
    });
    if (daCo) return { id: daCo.id, so: daCo.number, daCoTruoc: true };

    donMua = { id: dm.id, number: dm.number };
    nhaCungCapId = dm.supplierId;
    tinh = tinhDonMua(
      dm.items.map((i) => ({
        soLuong: i.quantity.toString(),
        donGia: i.unitPrice.toString(),
        chietKhau: i.discountPct.toString(),
        vat: i.vatRate.toString(),
      })),
    );
    dongGhi = dm.items.map((i, k) => ({
      tenantId: nc.tenantId,
      lineNo: k + 1,
      orderItemId: i.id,
      productId: i.productId,
      sku: i.sku,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      discountPct: i.discountPct,
      vatRate: i.vatRate,
      lineTotal: String(tinh.dong[k].thanhTien),
    }));
  } else {
    if (!nhaCungCapId) throw new LoiDinhDang("nhaCungCapId", "Chọn nhà cung cấp hoặc chọn đơn mua.");
    if (d.dong.length === 0) throw new LoiDinhDang("dong", "Hóa đơn lập tay phải có ít nhất một dòng.");
    tinh = tinhDonMua(d.dong.map((x) => ({ soLuong: x.soLuong, donGia: x.donGia, chietKhau: x.chietKhau, vat: x.vat })));
    dongGhi = d.dong.map((x, k) => ({
      tenantId: nc.tenantId,
      lineNo: k + 1,
      productId: x.sanPhamId || null,
      name: x.ten,
      quantity: x.soLuong,
      unit: x.donViTinh || null,
      unitPrice: x.donGia,
      discountPct: String(x.chietKhau ?? 0),
      vatRate: String(x.vat ?? 10),
      lineTotal: String(tinh.dong[k].thanhTien),
    }));
  }

  const ncc = await nc.tx.supplier.findFirst({ where: { id: nhaCungCapId }, select: { id: true, name: true, status: true } });
  if (!ncc) throw new LoiDinhDang("nhaCungCapId", "Không tìm thấy nhà cung cấp.");

  const so = await capSoChungTu(nc.tx, KIEU_SO_HOA_DON);
  const hd = await nc.tx.supplierBill.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      supplierId: ncc.id,
      purchaseOrderId: donMua?.id ?? null,
      ownerId: nc.hoSo.userId,
      supplierDocNo: d.soHoaDonNcc || null,
      notes: d.ghiChu || null,
      ...tongVeCot(tinh),
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
      items: { create: dongGhi },
    },
    select: { id: true },
  });

  await nc.kiemToan({
    action: "tao",
    objectType: "supplier_bill",
    objectId: hd.id,
    after: { so, nhaCungCap: ncc.name, tuDonMua: donMua?.number ?? null, tongCong: tinh.tongCong },
  });
  await nc.suKien({
    eventType: SU_KIEN.SUPPLIER_BILL_CREATED,
    objectType: "supplier_bill",
    objectId: hd.id,
    payload: { so, nhaCungCapId: ncc.id, tongCong: tinh.tongCong },
  });
  return { id: hd.id, so, daCoTruoc: false };
}

/**
 * CT-03: ghi nhận hóa đơn — chốt số tiền, ghi ngày và hạn, từ đây mới tính nợ phải trả.
 * Hạn thanh toán do **nhà cung cấp ghi trên hóa đơn**, nên bắt buộc nhập, không suy ra
 * từ một ngưỡng nào của hệ thống (CT-04).
 */
export async function ghiNhanHoaDonMua(nc: NguCanh, id: string, d: DuLieuGhiNhanHoaDonMua) {
  batBuocQuyen(nc.hoSo, "finance.approve", { objectType: "supplier_bill", objectId: id });
  await khoaChungTu(nc.tx, "supplier_bills", id);
  const hd = await docHoaDon(nc, id);
  if (hd.status !== "DRAFT") throw new LoiNghiepVu("Chỉ ghi nhận hóa đơn đang ở trạng thái Nháp.", 409, "sai-trang-thai");
  if (hd.items.length === 0) throw new LoiNghiepVu("Hóa đơn chưa có dòng nào.", 409, "hoa-don-rong");

  const ngayHoaDon = d.ngayHoaDon || homNayVN();
  if (d.hanThanhToan < ngayHoaDon) {
    throw new LoiDinhDang("hanThanhToan", "Hạn thanh toán không được trước ngày hóa đơn.");
  }
  if (ngayHoaDon > homNayVN()) throw new LoiDinhDang("ngayHoaDon", "Không ghi nhận hóa đơn cho ngày ở tương lai.");

  await nc.tx.supplierBill.update({
    where: { id },
    data: {
      status: TRANG_THAI_TINH_NO,
      billDate: ngayVeDate(ngayHoaDon),
      dueDate: ngayVeDate(d.hanThanhToan),
      recordedAt: new Date(),
      recordedBy: nc.hoSo.userId,
      ...(d.soHoaDonNcc ? { supplierDocNo: d.soHoaDonNcc } : {}),
      ...(d.ghiChu ? { notes: d.ghiChu } : {}),
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "supplier_bill",
    objectId: id,
    before: { trangThai: "DRAFT" },
    after: { trangThai: TRANG_THAI_TINH_NO, ngayHoaDon, hanThanhToan: d.hanThanhToan },
  });
  await nc.suKien({
    eventType: SU_KIEN.SUPPLIER_BILL_RECORDED,
    objectType: "supplier_bill",
    objectId: id,
    payload: { so: hd.number, tongCong: hd.total.toString(), hanThanhToan: d.hanThanhToan },
  });
  return { id, trangThai: TRANG_THAI_TINH_NO, ngayHoaDon, hanThanhToan: d.hanThanhToan };
}

/**
 * CT-08: hủy hóa đơn — chỉ khi chưa chi đồng nào **và** chưa có phiếu trả nhà cung cấp nào
 * chốt tiền vào nó (TV-TC-03), luôn phải ghi lý do. Khóa dòng hóa đơn trước khi đọc
 * (TV-TC-02) và ghi sự kiện như bên bán (TV-TC-07).
 */
export async function huyHoaDonMua(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "finance.approve", { objectType: "supplier_bill", objectId: id });
  await khoaChungTu(nc.tx, "supplier_bills", id);
  const hd = await docHoaDon(nc, id);
  if (hd.status === "CANCELLED") throw new LoiNghiepVu("Hóa đơn này đã hủy rồi.", 409, "da-huy");
  const daTra = daTraCua(hd);
  if (daTra > 0) {
    throw new LoiNghiepVu(
      `Hóa đơn đã chi ${dong(daTra).toLocaleString("vi-VN")} ₫ — hủy phiếu chi trước rồi mới hủy hóa đơn.`,
      409,
      "da-co-tien-chi",
      { daTra: dong(daTra) },
    );
  }
  const daGiamTru = daGiamTruCua(hd);
  if (daGiamTru > 0) {
    const phieu = phieuTraDaChotCua(hd);
    throw new LoiNghiepVu(
      `Hóa đơn đã được giảm trừ ${dong(daGiamTru).toLocaleString("vi-VN")} ₫ bằng hàng trả nhà cung cấp (${phieu.join(", ")}). ` +
        "Phiếu trả hàng đã chốt tiền thì không gỡ được, nên hóa đơn phải giữ lại để khoản giảm trừ còn chỗ bám. Nếu số liệu sai, xử lý bằng chứng từ điều chỉnh thay vì hủy hóa đơn.",
      409,
      "da-co-giam-tru",
      { daGiamTru: dong(daGiamTru), phieuTra: phieu },
    );
  }

  await nc.tx.supplierBill.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: lyDo, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "supplier_bill", objectId: id, before: { trangThai: hd.status }, after: { trangThai: "CANCELLED", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.SUPPLIER_BILL_CANCELLED, objectType: "supplier_bill", objectId: id, payload: { so: hd.number, lyDo } });
  return { id, trangThai: "CANCELLED" };
}

// ---------------------------------------------------------------------------
// Ghi: chi tiền
// ---------------------------------------------------------------------------

/**
 * CT-05: ghi nhận tiền đã trả nhà cung cấp và phân bổ cho từng hóa đơn.
 * Tổng phân bổ phải đúng bằng số tiền chi, và không hóa đơn nào bị trả quá phần còn nợ.
 */
export async function chiTien(nc: NguCanh, d: DuLieuChiTien) {
  batBuocQuyen(nc.hoSo, "finance.create", { objectType: "supplier_payment" });
  const ncc = await nc.tx.supplier.findFirst({ where: { id: d.nhaCungCapId }, select: { id: true, name: true } });
  if (!ncc) throw new LoiDinhDang("nhaCungCapId", "Không tìm thấy nhà cung cấp.");

  const tien = dong(d.soTien);
  if (tien <= 0) throw new LoiDinhDang("soTien", "Số tiền chi phải lớn hơn 0.");

  // Mỗi dòng phân bổ phải còn ít nhất 1 ₫ sau khi làm tròn về đồng — dòng 0 ₫ (hay 0,4 ₫)
  // trước đây lọt qua kiểm tổng rồi vấp CHECK amount > 0 của CSDL thành lỗi 500 (QA 0.16.1).
  for (const [i, p] of d.phanBo.entries()) {
    if (dong(p.soTien) <= 0) throw new LoiDinhDang("phanBo", `Dòng phân bổ ${i + 1}: số tiền phải từ 1 ₫ trở lên — bỏ dòng không chi tiền.`);
  }
  const tongPhanBo = d.phanBo.reduce((s, p) => s + dong(p.soTien), 0);
  if (tongPhanBo !== tien) {
    throw new LoiNghiepVu(
      `Tổng phân bổ (${tongPhanBo.toLocaleString("vi-VN")} ₫) phải đúng bằng số tiền chi (${tien.toLocaleString("vi-VN")} ₫).`,
      400,
      "phan-bo-khong-khop",
      { tongPhanBo, soTien: tien },
    );
  }

  // TV-TC-01: khóa mọi hóa đơn được phân bổ TRƯỚC khi đọc phần còn nợ — hai phiếu chi
  // cùng lúc cho một hóa đơn thì phiếu sau đọc lại số đã chi sau khi phiếu trước commit.
  const ids = d.phanBo.map((p) => p.hoaDonId);
  if (new Set(ids).size !== ids.length) {
    throw new LoiDinhDang("phanBo", "Mỗi hóa đơn chỉ được chọn một lần trong một phiếu chi — gộp số tiền vào một dòng.");
  }
  await khoaChungTu(nc.tx, "supplier_bills", ids);
  const hoaDon = await nc.tx.supplierBill.findMany({
    where: { AND: [{ id: { in: ids } }, await dieuKienXemHoaDonMua(nc)] },
    select: {
      id: true, number: true, supplierId: true, status: true, total: true,
      allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, purchaseReturn: { select: { status: true } } } },
    },
  });
  if (hoaDon.length !== new Set(ids).size) throw new LoiKhongTimThay("Hóa đơn nhà cung cấp");

  for (const pb of d.phanBo) {
    const hd = hoaDon.find((x) => x.id === pb.hoaDonId)!;
    if (hd.supplierId !== ncc.id) throw new LoiDinhDang("phanBo", `Hóa đơn ${hd.number} thuộc nhà cung cấp khác.`);
    if (hd.status !== TRANG_THAI_TINH_NO) {
      throw new LoiNghiepVu(`Hóa đơn ${hd.number} chưa ghi nhận hoặc đã hủy — chưa chi tiền được.`, 409, "hoa-don-chua-ghi-nhan");
    }
    const cn = congNo(hd.status, hd.total.toString(), daTraCua(hd), { trangThaiTinh: TRANG_THAI_TINH_NO, daGiamTru: daGiamTruCua(hd) });
    if (dong(pb.soTien) > cn.conNo) {
      throw new LoiNghiepVu(
        `Hóa đơn ${hd.number} chỉ còn nợ ${cn.conNo.toLocaleString("vi-VN")} ₫, không chi được ${dong(pb.soTien).toLocaleString("vi-VN")} ₫.`,
        409,
        "chi-vuot-cong-no",
        { hoaDonId: hd.id, conNo: cn.conNo },
      );
    }
  }

  const so = await capSoChungTu(nc.tx, KIEU_SO_PHIEU_CHI);
  const pc = await nc.tx.supplierPayment.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      supplierId: ncc.id,
      method: d.phuongThuc,
      amount: String(tien),
      paidAt: ngayVeDate(d.ngayChi || homNayVN()),
      reference: d.thamChieu || null,
      note: d.ghiChu || null,
      createdBy: nc.hoSo.userId,
      allocations: { create: d.phanBo.map((p) => ({ tenantId: nc.tenantId, billId: p.hoaDonId, amount: String(dong(p.soTien)) })) },
    },
    select: { id: true, number: true },
  });

  await nc.kiemToan({
    action: "tao",
    objectType: "supplier_payment",
    objectId: pc.id,
    after: { so, nhaCungCap: ncc.name, soTien: tien, soHoaDon: d.phanBo.length },
  });
  await nc.suKien({
    eventType: SU_KIEN.SUPPLIER_PAYMENT_MADE,
    objectType: "supplier_payment",
    objectId: pc.id,
    payload: { so, nhaCungCapId: ncc.id, soTien: tien },
  });

  // Hóa đơn nào vừa trả đủ thì ghi một sự kiện riêng.
  for (const pb of d.phanBo) {
    const hd = hoaDon.find((x) => x.id === pb.hoaDonId)!;
    const cn = congNo(hd.status, hd.total.toString(), daTraCua(hd) + dong(pb.soTien), { trangThaiTinh: TRANG_THAI_TINH_NO, daGiamTru: daGiamTruCua(hd) });
    if (cn.conNo === 0) {
      await nc.suKien({
        eventType: SU_KIEN.SUPPLIER_BILL_PAID,
        objectType: "supplier_bill",
        objectId: hd.id,
        payload: { so: hd.number, tongCong: cn.tong },
      });
    }
  }
  return { id: pc.id, so, soTien: tien };
}

/**
 * CT-09: hủy phiếu chi. Giữ bản ghi kèm lý do; công nợ quay lại đúng như trước.
 * Khóa phiếu chi rồi các hóa đơn nó phân bổ (TV-TC-02), ghi sự kiện như bên thu (TV-TC-07).
 */
export async function huyPhieuChi(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "finance.approve", { objectType: "supplier_payment", objectId: id });
  await khoaChungTu(nc.tx, "supplier_payments", id);
  const pc = await nc.tx.supplierPayment.findFirst({ where: { id }, select: { id: true, number: true, status: true, amount: true, allocations: { select: { billId: true } } } });
  if (!pc) throw new LoiKhongTimThay("Phiếu chi");
  await khoaChungTu(nc.tx, "supplier_bills", pc.allocations.map((a) => a.billId));
  if (pc.status === "huy") throw new LoiNghiepVu("Phiếu chi này đã hủy rồi.", 409, "da-huy");

  await nc.tx.supplierPayment.update({ where: { id }, data: { status: "huy", cancelledAt: new Date(), cancelReason: lyDo } });
  await nc.kiemToan({
    action: "sua",
    objectType: "supplier_payment",
    objectId: id,
    before: { trangThai: "hoat-dong", soTien: pc.amount.toString() },
    after: { trangThai: "huy", lyDo },
  });
  await nc.suKien({ eventType: SU_KIEN.SUPPLIER_PAYMENT_CANCELLED, objectType: "supplier_payment", objectId: id, payload: { so: pc.number, lyDo } });
  return { id, trangThai: "huy" };
}
