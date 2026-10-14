import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { dateVeNgay, homNayVN, locTheoPhamVi, ngayVeDate } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { tinhBaoGia, type DongBaoGia } from "@/modules/bao-gia/tinh-toan";
import { congNo, dong, hanThanhToanGoiY, nhomTuoiNo, soNgayQuaHan, tongHopTuoiNo } from "./tinh-toan";
import type { BoLocHoaDon, BoLocPhieuThu, DuLieuPhatHanh, DuLieuTaoHoaDon, DuLieuThuTien } from "./luoc-do";
import { taoThongBao } from "@/modules/thong-bao/service";
import { khoaChungTu } from "@/lib/khoa-chung-tu";

/**
 * Tài chính quản trị — mục 19 prompt 20/09. Luật: BUSINESS_RULES.md mục 11.
 *
 * Hóa đơn lập từ đơn hàng (chép dòng, giữ liên kết), phát hành rồi thì khóa số tiền.
 * Thu tiền ghi vào phiếu thu và **phân bổ** cho từng hóa đơn; công nợ luôn được TÍNH
 * (tổng hóa đơn − tổng phân bổ), không lưu thành cột nên không bao giờ lệch.
 *
 * Quyền `finance.*`; phạm vi theo người phụ trách hóa đơn (kế toán thường là "all").
 */

const CHON_DONG = {
  id: true, lineNo: true, orderItemId: true, productId: true, sku: true, name: true,
  quantity: true, unit: true, unitPrice: true, discountPct: true, vatRate: true, unitCost: true,
  lineTotal: true, lineCost: true,
} satisfies Prisma.InvoiceItemSelect;

const CHON = {
  id: true, number: true, status: true, issueDate: true, dueDate: true, paymentTerms: true,
  notes: true, subtotal: true, discountTotal: true, vatTotal: true, total: true, costTotal: true,
  issuedAt: true, cancelledAt: true, cancelReason: true, createdAt: true, updatedAt: true, ownerId: true,
  customer: { select: { id: true, code: true, name: true, taxCode: true } },
  salesOrder: { select: { id: true, number: true } },
  project: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, fullName: true } },
  items: { select: CHON_DONG, orderBy: { lineNo: "asc" } },
  allocations: { select: { id: true, amount: true, payment: { select: { id: true, number: true, status: true, receivedAt: true, method: true } } } },
  returnAllocations: { select: { id: true, amount: true, salesReturn: { select: { id: true, number: true, status: true, returnDate: true, kind: true } } } },
} satisfies Prisma.InvoiceSelect;

type BanGhi = Prisma.InvoiceGetPayload<{ select: typeof CHON }>;

function daThuCua(hd: { allocations: { amount: Prisma.Decimal; payment: { status: string } }[] }): number {
  return hd.allocations.filter((a) => a.payment.status === "hoat-dong").reduce((s, a) => s + Number(a.amount), 0);
}

/**
 * Phần nợ đã bị xóa bằng hàng khách trả lại (TH-07). Chỉ tính phiếu đã chốt tiền;
 * phiếu còn nháp hoặc đã hủy chưa đụng tới công nợ.
 */
function daGiamTruCua(hd: { returnAllocations: { amount: Prisma.Decimal; salesReturn: { status: string } }[] }): number {
  return hd.returnAllocations.filter((a) => a.salesReturn.status === "SETTLED").reduce((s, a) => s + Number(a.amount), 0);
}

/** Các phiếu khách trả đã chốt tiền vào hóa đơn này — còn thì hủy hóa đơn sẽ bỏ rơi khoản giảm trừ (TV-TC-03). */
function phieuTraDaChotCua(hd: { returnAllocations: { salesReturn: { status: string; number: string } }[] }): string[] {
  return [...new Set(hd.returnAllocations.filter((a) => a.salesReturn.status === "SETTLED").map((a) => a.salesReturn.number))];
}

function hoaDonRa(hd: BanGhi, homNay: string) {
  const daThu = daThuCua(hd);
  const cn = congNo(hd.status, hd.total.toString(), daThu, { daGiamTru: daGiamTruCua(hd) });
  const han = dateVeNgay(hd.dueDate) || null;
  const quaHan = hd.status === "ISSUED" && cn.conNo > 0 ? soNgayQuaHan(han, homNay) : 0;
  return {
    id: hd.id,
    so: hd.number,
    trangThai: hd.status,
    ngayPhatHanh: hd.issueDate,
    hanThanhToan: hd.dueDate,
    dieuKhoanThanhToan: hd.paymentTerms,
    ghiChu: hd.notes,
    tamTinh: hd.subtotal.toString(),
    tongChietKhau: hd.discountTotal.toString(),
    tongVat: hd.vatTotal.toString(),
    tongCong: hd.total.toString(),
    tongGiaVon: hd.costTotal.toString(),
    daThu: cn.daThu,
    daGiamTru: cn.daGiamTru,
    conNo: cn.conNo,
    tinhTrangThu: cn.tinhTrang,
    soNgayQuaHan: quaHan,
    nhomTuoiNo: cn.conNo > 0 ? nhomTuoiNo(quaHan) : "trong-han",
    huyLuc: hd.cancelledAt,
    lyDoHuy: hd.cancelReason,
    khachHang: { id: hd.customer.id, ma: hd.customer.code, ten: hd.customer.name, maSoThue: hd.customer.taxCode },
    donHang: hd.salesOrder ? { id: hd.salesOrder.id, so: hd.salesOrder.number } : null,
    duAn: hd.project ? { id: hd.project.id, ma: hd.project.code, ten: hd.project.name } : null,
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
      giaVon: d.unitCost.toString(),
      thanhTien: d.lineTotal.toString(),
    })),
    phieuThu: hd.allocations.map((a) => ({
      id: a.payment.id,
      so: a.payment.number,
      soTien: Number(a.amount),
      phuongThuc: a.payment.method,
      ngayThu: a.payment.receivedAt,
      trangThai: a.payment.status,
    })),
    traHang: hd.returnAllocations.map((a) => ({
      id: a.salesReturn.id,
      so: a.salesReturn.number,
      loai: a.salesReturn.kind,
      ngayTra: a.salesReturn.returnDate,
      trangThai: a.salesReturn.status,
      soTien: Number(a.amount),
    })),
    taoLuc: hd.createdAt,
    suaLuc: hd.updatedAt,
  };
}
export type HoaDonChiTiet = ReturnType<typeof hoaDonRa>;

// ---------------------------------------------------------------------------
// Phạm vi
// ---------------------------------------------------------------------------

export async function dieuKienXemHoaDon(nc: NguCanh): Promise<Prisma.InvoiceWhereInput> {
  const [theoHoaDon, pvKhach] = await Promise.all([
    locTheoPhamVi(nc, "finance.view"),
    idNguoiTrongPhamVi(nc.tx, nc.hoSo, "customer.view"),
  ]);
  if (!theoHoaDon.ownerId || pvKhach === "tat-ca") return {};
  return { OR: [theoHoaDon, { customer: { ownerId: { in: pvKhach } } }] };
}

async function docHoaDon(nc: NguCanh, id: string): Promise<BanGhi> {
  const hd = await nc.tx.invoice.findFirst({ where: { AND: [{ id }, await dieuKienXemHoaDon(nc)] }, select: CHON });
  if (!hd) throw new LoiKhongTimThay("Hóa đơn");
  return hd;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachHoaDon(nc: NguCanh, boLoc: BoLocHoaDon) {
  batBuocQuyen(nc.hoSo, "finance.view");
  const homNay = homNayVN();
  const dieuKien: Prisma.InvoiceWhereInput[] = [await dieuKienXemHoaDon(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [{ number: { contains: boLoc.q, mode: "insensitive" } }, { customer: { name: { contains: boLoc.q, mode: "insensitive" } } }],
    });
  }
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });
  if (boLoc.trangThai === "qua-han") dieuKien.push({ status: "ISSUED", dueDate: { lt: ngayVeDate(homNay) } });
  else if (boLoc.trangThai === "" ) dieuKien.push({ status: "ISSUED" });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });

  const where: Prisma.InvoiceWhereInput = { AND: dieuKien };
  const [tong, ds, tatCa] = await Promise.all([
    nc.tx.invoice.count({ where }),
    nc.tx.invoice.findMany({ where, select: CHON, orderBy: [{ createdAt: "desc" }], skip: (boLoc.trang - 1) * boLoc.coTrang, take: boLoc.coTrang }),
    nc.tx.invoice.findMany({
      where: { AND: [await dieuKienXemHoaDon(nc), { status: "ISSUED" }] },
      select: { total: true, dueDate: true, status: true, allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, salesReturn: { select: { status: true } } } } },
    }),
  ]);

  const dong2 = ds.map((hd) => hoaDonRa(hd, homNay)).filter((hd) => (boLoc.trangThai === "" ? hd.conNo > 0 : true));
  const congNoTatCa = tatCa.map((hd) => {
    const cn = congNo(hd.status, hd.total.toString(), daThuCua(hd), { daGiamTru: daGiamTruCua(hd) });
    return { conNo: cn.conNo, soNgayQuaHan: soNgayQuaHan(dateVeNgay(hd.dueDate) || null, homNay) };
  });

  return {
    tong: boLoc.trangThai === "" ? dong2.length : tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: dong2,
    tomTat: tongHopTuoiNo(congNoTatCa),
  };
}

export async function chiTietHoaDon(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "finance.view", { objectType: "invoice", objectId: id });
  const hd = await docHoaDon(nc, id);
  const hoaDon = hoaDonRa(hd, homNayVN());
  const duocGhi = coQuyen(nc.hoSo, "finance.update");
  return {
    hoaDon,
    quyen: {
      sua: duocGhi && hoaDon.trangThai === "DRAFT",
      phatHanh: coQuyen(nc.hoSo, "finance.approve") && hoaDon.trangThai === "DRAFT" && hoaDon.dong.length > 0,
      huy: coQuyen(nc.hoSo, "finance.approve") && hoaDon.trangThai !== "CANCELLED" && hoaDon.daThu === 0 && hoaDon.daGiamTru === 0,
      thuTien: duocGhi && hoaDon.trangThai === "ISSUED" && hoaDon.conNo > 0,
    },
  };
}

/** Công nợ theo khách: ai đang nợ bao nhiêu, quá hạn bao lâu. */
export async function congNoTheoKhach(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "finance.view");
  const homNay = homNayVN();
  const ds = await nc.tx.invoice.findMany({
    where: { AND: [await dieuKienXemHoaDon(nc), { status: "ISSUED" }] },
    select: {
      id: true, number: true, total: true, dueDate: true, status: true,
      customer: { select: { id: true, code: true, name: true } },
      allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, salesReturn: { select: { status: true } } } },
    },
    orderBy: { dueDate: "asc" },
  });

  const theoKhach = new Map<string, { khachHang: { id: string; ma: string; ten: string }; conNo: number; quaHan: number; soHoaDon: number; quaHanLauNhat: number }>();
  const chiTiet: { conNo: number; soNgayQuaHan: number }[] = [];
  for (const hd of ds) {
    const cn = congNo(hd.status, hd.total.toString(), daThuCua(hd), { daGiamTru: daGiamTruCua(hd) });
    if (cn.conNo <= 0) continue;
    const ngay = soNgayQuaHan(dateVeNgay(hd.dueDate) || null, homNay);
    chiTiet.push({ conNo: cn.conNo, soNgayQuaHan: ngay });
    const k = theoKhach.get(hd.customer.id) ?? {
      khachHang: { id: hd.customer.id, ma: hd.customer.code, ten: hd.customer.name },
      conNo: 0, quaHan: 0, soHoaDon: 0, quaHanLauNhat: 0,
    };
    k.conNo += cn.conNo;
    k.soHoaDon += 1;
    if (ngay > 0) {
      k.quaHan += cn.conNo;
      k.quaHanLauNhat = Math.max(k.quaHanLauNhat, ngay);
    }
    theoKhach.set(hd.customer.id, k);
  }

  return {
    khach: [...theoKhach.values()].sort((a, b) => b.quaHan - a.quaHan || b.conNo - a.conNo),
    tomTat: tongHopTuoiNo(chiTiet),
    nguongCanhBao: await docCauHinh(nc.tx, "tai_chinh.canh_bao_qua_han_ngay"),
  };
}

export async function danhSachPhieuThu(nc: NguCanh, boLoc: BoLocPhieuThu) {
  batBuocQuyen(nc.hoSo, "finance.view");
  const dieuKien: Prisma.PaymentWhereInput[] = [];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { reference: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });
  if (boLoc.tuNgay) dieuKien.push({ receivedAt: { gte: ngayVeDate(boLoc.tuNgay) } });
  if (boLoc.denNgay) dieuKien.push({ receivedAt: { lte: ngayVeDate(boLoc.denNgay) } });

  const where: Prisma.PaymentWhereInput = { AND: dieuKien };
  const [tong, ds, tatCa] = await Promise.all([
    nc.tx.payment.count({ where }),
    nc.tx.payment.findMany({
      where,
      select: {
        id: true, number: true, method: true, amount: true, receivedAt: true, reference: true,
        note: true, status: true, cancelReason: true, createdAt: true,
        customer: { select: { id: true, code: true, name: true } },
        allocations: { select: { amount: true, invoice: { select: { id: true, number: true } } } },
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
    nc.tx.payment.findMany({ where: { AND: [...dieuKien, { status: "hoat-dong" }] }, select: { amount: true } }),
  ]);

  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    tongTienThu: dong(tatCa.reduce((s, p) => s + Number(p.amount), 0)),
    dong: ds.map((p) => ({
      id: p.id,
      so: p.number,
      phuongThuc: p.method,
      soTien: p.amount.toString(),
      ngayThu: p.receivedAt,
      thamChieu: p.reference,
      ghiChu: p.note,
      trangThai: p.status,
      lyDoHuy: p.cancelReason,
      khachHang: { id: p.customer.id, ma: p.customer.code, ten: p.customer.name },
      phanBo: p.allocations.map((a) => ({ hoaDonId: a.invoice.id, soHoaDon: a.invoice.number, soTien: a.amount.toString() })),
      taoLuc: p.createdAt,
    })),
  };
}

/** Hóa đơn còn nợ của một khách — để màn hình thu tiền phân bổ nhanh. */
export async function hoaDonConNo(nc: NguCanh, khachHangId: string) {
  batBuocQuyen(nc.hoSo, "finance.view");
  const homNay = homNayVN();
  const ds = await nc.tx.invoice.findMany({
    where: { AND: [await dieuKienXemHoaDon(nc), { customerId: khachHangId, status: "ISSUED" }] },
    select: { id: true, number: true, total: true, dueDate: true, status: true, allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, salesReturn: { select: { status: true } } } } },
    orderBy: { dueDate: "asc" },
  });
  return ds
    .map((hd) => {
      const cn = congNo(hd.status, hd.total.toString(), daThuCua(hd), { daGiamTru: daGiamTruCua(hd) });
      return {
        id: hd.id,
        so: hd.number,
        tongCong: cn.tong,
        daThu: cn.daThu,
        conNo: cn.conNo,
        hanThanhToan: hd.dueDate,
        soNgayQuaHan: soNgayQuaHan(dateVeNgay(hd.dueDate) || null, homNay),
      };
    })
    .filter((hd) => hd.conNo > 0);
}

// ---------------------------------------------------------------------------
// Ghi: hóa đơn
// ---------------------------------------------------------------------------

function tongVeCot(tinh: ReturnType<typeof tinhBaoGia>) {
  return {
    subtotal: String(tinh.tamTinh),
    discountTotal: String(tinh.tongChietKhau),
    vatTotal: String(tinh.tongVat),
    total: String(tinh.tongCong),
    costTotal: String(tinh.tongGiaVon),
  };
}

/**
 * Lập hóa đơn. Hai đường: từ **đơn hàng** (chép dòng, giữ liên kết từng dòng) hoặc
 * nhập tay cho khách. Một đơn chỉ có một hóa đơn còn hiệu lực (TC-02).
 *
 * Lập từ đơn: khóa dòng đơn hàng TRƯỚC khi dò hóa đơn đã có (TV-TC-04) — hai lần bấm cùng
 * lúc thì lần sau chờ lần trước commit rồi trả đúng hóa đơn đó. Chỉ mục riêng phần
 * `invoices_mot_hieu_luc_moi_don` là chốt cuối ở CSDL.
 */
export async function taoHoaDon(nc: NguCanh, d: DuLieuTaoHoaDon) {
  batBuocQuyen(nc.hoSo, "finance.create", { objectType: "invoice" });

  let khachHangId = d.khachHangId ?? null;
  let donHang: { id: string; number: string; customerId: string; status: string; paymentTerms: string | null } | null = null;
  let dongGhi: Prisma.InvoiceItemCreateManyInvoiceInput[] = [];
  let tinh: ReturnType<typeof tinhBaoGia>;

  if (d.donHangId) {
    await khoaChungTu(nc.tx, "sales_orders", d.donHangId);
    const don = await nc.tx.salesOrder.findFirst({
      where: { id: d.donHangId },
      select: {
        id: true, number: true, customerId: true, status: true, paymentTerms: true,
        items: { select: { id: true, productId: true, sku: true, name: true, quantity: true, unit: true, unitPrice: true, discountPct: true, vatRate: true, unitCost: true }, orderBy: { lineNo: "asc" } },
      },
    });
    if (!don) throw new LoiDinhDang("donHangId", "Không tìm thấy đơn hàng.");
    if (don.status === "DRAFT") throw new LoiNghiepVu("Đơn còn nháp — xác nhận đơn trước khi xuất hóa đơn.", 409, "don-con-nhap");
    if (don.status === "CANCELLED") throw new LoiNghiepVu("Đơn đã hủy thì không xuất hóa đơn.", 409, "don-da-huy");
    if (d.khachHangId && d.khachHangId !== don.customerId) {
      throw new LoiDinhDang("khachHangId", `Đơn ${don.number} là của khách khác — bỏ chọn khách hoặc chọn đúng đơn của khách này.`);
    }

    const daCo = await nc.tx.invoice.findFirst({ where: { salesOrderId: don.id, status: { not: "CANCELLED" } }, select: { id: true, number: true } });
    if (daCo) return { id: daCo.id, so: daCo.number, daCoTruoc: true };

    donHang = { id: don.id, number: don.number, customerId: don.customerId, status: don.status, paymentTerms: don.paymentTerms };
    khachHangId = don.customerId;
    tinh = tinhBaoGia(
      don.items.map((i) => ({ soLuong: i.quantity.toString(), donGia: i.unitPrice.toString(), chietKhau: i.discountPct.toString(), vat: i.vatRate.toString(), giaVon: i.unitCost.toString() })) as DongBaoGia[],
    );
    dongGhi = don.items.map((i, k) => ({
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
      unitCost: i.unitCost,
      lineTotal: String(tinh.dong[k].thanhTien),
      lineCost: String(tinh.dong[k].giaVonDong),
    }));
  } else {
    if (!khachHangId) throw new LoiDinhDang("khachHangId", "Chọn khách hàng hoặc chọn đơn hàng để lập hóa đơn.");
    if (d.dong.length === 0) throw new LoiDinhDang("dong", "Hóa đơn lập tay phải có ít nhất một dòng.");
    tinh = tinhBaoGia(d.dong.map((x) => ({ soLuong: x.soLuong, donGia: x.donGia, chietKhau: x.chietKhau, vat: x.vat, giaVon: x.giaVon })) as DongBaoGia[]);
    dongGhi = d.dong.map((x, k) => ({
      tenantId: nc.tenantId,
      lineNo: k + 1,
      productId: x.sanPhamId ?? null,
      name: x.ten,
      quantity: x.soLuong,
      unit: x.donViTinh || null,
      unitPrice: x.donGia,
      discountPct: x.chietKhau,
      vatRate: x.vat,
      unitCost: x.giaVon,
      lineTotal: String(tinh.dong[k].thanhTien),
      lineCost: String(tinh.dong[k].giaVonDong),
    }));
  }

  const khach = await batBuocThayKhach(nc, khachHangId);

  // TV-TC-05 (G9): dự án gắn vào hóa đơn phải là dự án của chính khách đó, và nếu dự án đã
  // gắn một đơn hàng thì phải là đúng đơn đang lập hóa đơn — không để doanh thu một khách
  // đổ nhầm vào dự án của khách khác.
  if (d.duAnId) {
    const duAn = await nc.tx.project.findFirst({ where: { id: d.duAnId }, select: { id: true, code: true, customerId: true, salesOrderId: true } });
    if (!duAn) throw new LoiDinhDang("duAnId", "Không tìm thấy dự án.");
    if (duAn.customerId !== khach.id) {
      throw new LoiDinhDang("duAnId", `Dự án ${duAn.code} là của khách khác — chọn dự án của chính khách trên hóa đơn.`);
    }
    if (donHang && duAn.salesOrderId && duAn.salesOrderId !== donHang.id) {
      throw new LoiDinhDang("duAnId", `Dự án ${duAn.code} gắn với một đơn hàng khác, không phải đơn ${donHang.number}.`);
    }
  }

  const so = await capSoChungTu(nc.tx, KIEU_SO.hoaDon);
  const hd = await nc.tx.invoice.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      customerId: khach.id,
      salesOrderId: donHang?.id ?? null,
      projectId: d.duAnId || null,
      ownerId: nc.hoSo.userId,
      paymentTerms: donHang?.paymentTerms ?? null,
      notes: d.ghiChu || null,
      ...tongVeCot(tinh),
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
      items: { create: dongGhi },
    },
    select: { id: true, number: true },
  });

  await nc.kiemToan({ action: "tao", objectType: "invoice", objectId: hd.id, after: { so, khachHangId: khach.id, tuDonHang: donHang?.number ?? null, tongCong: tinh.tongCong } });
  await nc.suKien({ eventType: SU_KIEN.INVOICE_CREATED, objectType: "invoice", objectId: hd.id, payload: { so, khachHangId: khach.id, tongCong: tinh.tongCong } });
  return { id: hd.id, so, daCoTruoc: false };
}

/** Phát hành hóa đơn: chốt số tiền, đặt hạn thanh toán, từ đây mới tính công nợ (TC-03). */
export async function phatHanhHoaDon(nc: NguCanh, id: string, d: DuLieuPhatHanh) {
  batBuocQuyen(nc.hoSo, "finance.approve", { objectType: "invoice", objectId: id });
  await khoaChungTu(nc.tx, "invoices", id);
  const hd = await docHoaDon(nc, id);
  if (hd.status !== "DRAFT") throw new LoiNghiepVu("Chỉ phát hành hóa đơn đang ở trạng thái Nháp.", 409, "sai-trang-thai");
  if (hd.items.length === 0) throw new LoiNghiepVu("Hóa đơn chưa có dòng nào.", 409, "hoa-don-rong");

  const ngayPhatHanh = d.ngayPhatHanh || homNayVN();
  const soNgay = await docCauHinh(nc.tx, "tai_chinh.so_ngay_cong_no_mac_dinh");
  const han = d.hanThanhToan || hanThanhToanGoiY(ngayPhatHanh, soNgay);
  if (!han) {
    throw new LoiDinhDang("hanThanhToan", "Chọn hạn thanh toán (hoặc đặt số ngày công nợ mặc định ở Quản trị → Cấu hình).");
  }
  if (han < ngayPhatHanh) throw new LoiDinhDang("hanThanhToan", "Hạn thanh toán không được trước ngày phát hành.");

  await nc.tx.invoice.update({
    where: { id },
    data: {
      status: "ISSUED",
      issueDate: ngayVeDate(ngayPhatHanh),
      dueDate: ngayVeDate(han),
      issuedAt: new Date(),
      issuedBy: nc.hoSo.userId,
      ...(d.ghiChu !== undefined && d.ghiChu ? { notes: d.ghiChu } : {}),
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({ action: "sua", objectType: "invoice", objectId: id, before: { trangThai: "DRAFT" }, after: { trangThai: "ISSUED", ngayPhatHanh, hanThanhToan: han } });
  await nc.suKien({ eventType: SU_KIEN.INVOICE_ISSUED, objectType: "invoice", objectId: id, payload: { so: hd.number, tongCong: hd.total.toString(), hanThanhToan: han } });
  return { id, trangThai: "ISSUED", ngayPhatHanh, hanThanhToan: han };
}

/**
 * Hủy hóa đơn — chỉ khi chưa thu đồng nào **và** chưa có phiếu khách trả nào chốt tiền vào
 * nó, và luôn phải ghi lý do (TC-08, TV-TC-03). Khóa dòng hóa đơn trước khi đọc để một
 * phiếu thu chạy cùng lúc không lọt vào giữa (TV-TC-02).
 */
export async function huyHoaDon(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "finance.approve", { objectType: "invoice", objectId: id });
  await khoaChungTu(nc.tx, "invoices", id);
  const hd = await docHoaDon(nc, id);
  if (hd.status === "CANCELLED") throw new LoiNghiepVu("Hóa đơn này đã hủy rồi.", 409, "da-huy");
  const daThu = daThuCua(hd);
  if (daThu > 0) {
    throw new LoiNghiepVu(`Hóa đơn đã thu ${dong(daThu).toLocaleString("vi-VN")} ₫ — hủy phiếu thu trước rồi mới hủy hóa đơn.`, 409, "da-co-tien-thu", { daThu: dong(daThu) });
  }
  const daGiamTru = daGiamTruCua(hd);
  if (daGiamTru > 0) {
    const phieu = phieuTraDaChotCua(hd);
    throw new LoiNghiepVu(
      `Hóa đơn đã được giảm trừ ${dong(daGiamTru).toLocaleString("vi-VN")} ₫ bằng hàng khách trả (${phieu.join(", ")}). ` +
        "Phiếu trả hàng đã chốt tiền thì không gỡ được, nên hóa đơn phải giữ lại để khoản giảm trừ còn chỗ bám. Nếu số liệu sai, xử lý bằng chứng từ điều chỉnh thay vì hủy hóa đơn.",
      409, "da-co-giam-tru", { daGiamTru: dong(daGiamTru), phieuTra: phieu },
    );
  }

  await nc.tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: lyDo, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "invoice", objectId: id, before: { trangThai: hd.status }, after: { trangThai: "CANCELLED", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.INVOICE_CANCELLED, objectType: "invoice", objectId: id, payload: { so: hd.number, lyDo } });
  return { id, trangThai: "CANCELLED" };
}

// ---------------------------------------------------------------------------
// Ghi: thu tiền
// ---------------------------------------------------------------------------

/**
 * Ghi nhận tiền khách trả và phân bổ cho từng hóa đơn.
 * Tổng phân bổ phải đúng bằng số tiền thu, và không hóa đơn nào bị trả quá phần còn nợ (TC-05).
 */
export async function thuTien(nc: NguCanh, d: DuLieuThuTien) {
  batBuocQuyen(nc.hoSo, "finance.create", { objectType: "payment" });
  const khach = await batBuocThayKhach(nc, d.khachHangId);
  const tien = dong(d.soTien);
  if (tien <= 0) throw new LoiDinhDang("soTien", "Số tiền thu phải lớn hơn 0.");

  const tongPhanBo = d.phanBo.reduce((s, p) => s + dong(p.soTien), 0);
  if (tongPhanBo !== tien) {
    throw new LoiNghiepVu(
      `Tổng phân bổ (${tongPhanBo.toLocaleString("vi-VN")} ₫) phải đúng bằng số tiền thu (${tien.toLocaleString("vi-VN")} ₫).`,
      400, "phan-bo-khong-khop", { tongPhanBo, soTien: tien },
    );
  }

  // TV-TC-01: khóa mọi hóa đơn được phân bổ (thứ tự id tăng dần) TRƯỚC khi đọc phần còn nợ.
  // Hai phiếu thu cùng lúc cho một hóa đơn — kể cả bấm đúp — thì phiếu sau chờ phiếu trước
  // commit rồi mới đọc lại số đã thu, nên không thu vượt.
  const ids = d.phanBo.map((p) => p.hoaDonId);
  if (new Set(ids).size !== ids.length) {
    throw new LoiDinhDang("phanBo", "Mỗi hóa đơn chỉ được chọn một lần trong một phiếu thu — gộp số tiền vào một dòng.");
  }
  await khoaChungTu(nc.tx, "invoices", ids);
  const hoaDon = await nc.tx.invoice.findMany({
    where: { AND: [{ id: { in: ids } }, await dieuKienXemHoaDon(nc)] },
    select: { id: true, number: true, customerId: true, ownerId: true, status: true, total: true, allocations: { select: { amount: true, payment: { select: { status: true } } } }, returnAllocations: { select: { amount: true, salesReturn: { select: { status: true } } } } },
  });
  if (hoaDon.length !== new Set(ids).size) throw new LoiKhongTimThay("Hóa đơn");

  for (const pb of d.phanBo) {
    const hd = hoaDon.find((x) => x.id === pb.hoaDonId)!;
    if (hd.customerId !== khach.id) throw new LoiDinhDang("phanBo", `Hóa đơn ${hd.number} thuộc khách khác.`);
    if (hd.status !== "ISSUED") throw new LoiNghiepVu(`Hóa đơn ${hd.number} chưa phát hành hoặc đã hủy — chưa thu tiền được.`, 409, "hoa-don-chua-phat-hanh");
    const cn = congNo(hd.status, hd.total.toString(), daThuCua(hd), { daGiamTru: daGiamTruCua(hd) });
    if (dong(pb.soTien) > cn.conNo) {
      throw new LoiNghiepVu(
        `Hóa đơn ${hd.number} chỉ còn nợ ${cn.conNo.toLocaleString("vi-VN")} ₫, không thu được ${dong(pb.soTien).toLocaleString("vi-VN")} ₫.`,
        409, "thu-vuot-cong-no", { hoaDonId: hd.id, conNo: cn.conNo },
      );
    }
  }

  const so = await capSoChungTu(nc.tx, KIEU_SO.phieuThu);
  const pt = await nc.tx.payment.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      customerId: khach.id,
      method: d.phuongThuc,
      amount: String(tien),
      receivedAt: ngayVeDate(d.ngayThu || homNayVN()),
      reference: d.thamChieu || null,
      note: d.ghiChu || null,
      createdBy: nc.hoSo.userId,
      allocations: { create: d.phanBo.map((p) => ({ tenantId: nc.tenantId, invoiceId: p.hoaDonId, amount: String(dong(p.soTien)) })) },
    },
    select: { id: true, number: true },
  });

  await nc.kiemToan({ action: "tao", objectType: "payment", objectId: pt.id, after: { so, khachHangId: khach.id, soTien: tien, soHoaDon: d.phanBo.length } });
  await nc.suKien({ eventType: SU_KIEN.PAYMENT_RECEIVED, objectType: "payment", objectId: pt.id, payload: { so, khachHangId: khach.id, soTien: tien } });

  // Hóa đơn nào vừa thu đủ thì ghi một sự kiện riêng — để Phase 8 bắt được mà nhắc việc.
  for (const pb of d.phanBo) {
    const hd = hoaDon.find((x) => x.id === pb.hoaDonId)!;
    const cn = congNo(hd.status, hd.total.toString(), daThuCua(hd) + dong(pb.soTien), { daGiamTru: daGiamTruCua(hd) });
    if (cn.conNo === 0) {
      await nc.suKien({ eventType: SU_KIEN.INVOICE_PAID, objectType: "invoice", objectId: hd.id, payload: { so: hd.number, tongCong: cn.tong } });
      if (hd.ownerId !== nc.hoSo.userId) {
        await taoThongBao(nc.tx, nc.tenantId, {
          nguoiNhanId: hd.ownerId,
          loai: "hoa-don-thu-du",
          tieuDe: `Hóa đơn ${hd.number} đã thu đủ`,
          noiDung: `Khách ${khach.ten} đã trả hết ${cn.tong.toLocaleString("vi-VN")} ₫.`,
          duongDan: `/tai-chinh/hoa-don/${hd.id}`,
          doiTuong: "invoice",
          doiTuongId: hd.id,
          khoaChongTrung: `hoa-don-thu-du:${hd.id}`,
        });
      }
    }
  }
  return { id: pt.id, so, soTien: tien };
}

/**
 * Hủy phiếu thu (ghi nhầm, séc không thanh toán). Giữ bản ghi kèm lý do (TC-09).
 * Khóa phiếu thu rồi các hóa đơn nó phân bổ (TV-TC-02): hai lần hủy cùng lúc chỉ một lần
 * ghi, và không chen giữa một phiếu thu / hủy hóa đơn đang chạy trên cùng hóa đơn.
 */
export async function huyPhieuThu(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "finance.approve", { objectType: "payment", objectId: id });
  await khoaChungTu(nc.tx, "payments", id);
  const pt = await nc.tx.payment.findFirst({ where: { id }, select: { id: true, number: true, status: true, amount: true, allocations: { select: { invoiceId: true } } } });
  if (!pt) throw new LoiKhongTimThay("Phiếu thu");
  await khoaChungTu(nc.tx, "invoices", pt.allocations.map((a) => a.invoiceId));
  if (pt.status === "huy") throw new LoiNghiepVu("Phiếu thu này đã hủy rồi.", 409, "da-huy");

  await nc.tx.payment.update({ where: { id }, data: { status: "huy", cancelledAt: new Date(), cancelReason: lyDo } });
  await nc.kiemToan({ action: "sua", objectType: "payment", objectId: id, before: { trangThai: "hoat-dong", soTien: pt.amount.toString() }, after: { trangThai: "huy", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.PAYMENT_CANCELLED, objectType: "payment", objectId: id, payload: { so: pt.number, lyDo } });
  return { id, trangThai: "huy" };
}
