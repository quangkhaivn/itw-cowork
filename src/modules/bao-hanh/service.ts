import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { dateVeNgay, homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { mucBaoHanh, ngayHetHan, soNgayConLai } from "./tinh-toan";

/**
 * Bảo hành — mục 18 prompt 20/09. Luật: BUSINESS_RULES.md mục 8 (BH-01 → BH-06).
 *
 * Bảo hành **tự sinh khi xuất hàng**: mỗi số sê-ri một phiếu bảo hành, hàng không quản lý
 * sê-ri thì một phiếu cho cả dòng. Thời hạn lấy từ số tháng bảo hành của sản phẩm — chụp
 * lại tại thời điểm giao, nên sau này đổi chính sách cũng không làm đổi bảo hành đã cấp.
 *
 * Quyền: xem theo `service_desk.view` hoặc `customer.view`; sửa/hủy cần `service_desk.update`.
 */

export const LuocDoLocBaoHanh = z.object({
  q: z.string().trim().max(100).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  /** "" = còn hiệu lực; "sap-het"; "het-han"; "tat-ca". */
  tinhTrang: z.enum(["", "sap-het", "het-han", "tat-ca"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocBaoHanh = z.infer<typeof LuocDoLocBaoHanh>;

export const LuocDoSuaBaoHanh = z.object({
  soThang: z.coerce.number().int().min(0).max(240).optional(),
  ngayBatDau: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ.").optional(),
  ghiChu: z.string().trim().max(2000).optional(),
  lyDo: z.string().trim().min(2, "Sửa bảo hành phải ghi lý do.").max(500),
});

const CHON = {
  id: true, serial: true, productName: true, months: true, startDate: true, endDate: true,
  status: true, note: true, createdAt: true,
  customer: { select: { id: true, code: true, name: true } },
  product: { select: { id: true, sku: true, name: true } },
  salesOrder: { select: { id: true, number: true } },
  delivery: { select: { id: true, number: true, deliveredAt: true } },
} satisfies Prisma.WarrantySelect;

function baoHanhRa(w: Prisma.WarrantyGetPayload<{ select: typeof CHON }>, homNay: string, nguong: number | null) {
  const hetHan = dateVeNgay(w.endDate);
  return {
    id: w.id,
    serial: w.serial,
    tenHang: w.productName,
    soThang: w.months,
    ngayBatDau: dateVeNgay(w.startDate),
    ngayHetHan: hetHan,
    soNgayConLai: soNgayConLai(hetHan, homNay),
    trangThai: w.status,
    mucBaoHanh: mucBaoHanh(w.status, hetHan, homNay, nguong),
    ghiChu: w.note,
    khachHang: { id: w.customer.id, ma: w.customer.code, ten: w.customer.name },
    sanPham: w.product ? { id: w.product.id, sku: w.product.sku, ten: w.product.name } : null,
    donHang: w.salesOrder ? { id: w.salesOrder.id, so: w.salesOrder.number } : null,
    phieuXuat: w.delivery ? { id: w.delivery.id, so: w.delivery.number, luc: w.delivery.deliveredAt } : null,
    taoLuc: w.createdAt,
  };
}
export type BaoHanhChiTiet = ReturnType<typeof baoHanhRa>;

/** Ngưỡng cảnh báo "sắp hết bảo hành" (ngày). Chưa đặt thì không có mức sắp hết. */
export async function nguongSapHet(nc: NguCanh) {
  return docCauHinh(nc.tx, "theo_doi.bao_hanh_sap_het_ngay");
}

// ---------------------------------------------------------------------------
// Sinh bảo hành khi giao hàng
// ---------------------------------------------------------------------------

export interface YeuCauTaoBaoHanh {
  khachHangId: string;
  sanPhamId: string | null;
  tenHang: string;
  soThang: number;
  ngayGiao: Date;
  donHangId: string;
  dongDonId: string;
  phieuXuatId: string;
  /** Mỗi sê-ri một phiếu bảo hành; không có sê-ri thì một phiếu cho cả dòng. */
  serial: { id: string; serial: string }[];
  soLuongKhongSerial: number;
}

/**
 * Sinh bảo hành cho một dòng vừa xuất. Gọi từ `taoPhieuXuat()` của phân hệ Đơn hàng —
 * không kiểm quyền ở đây, người gọi đã kiểm (BH-01).
 */
export async function sinhBaoHanhKhiGiao(nc: NguCanh, yc: YeuCauTaoBaoHanh) {
  const batDau = dateVeNgay(yc.ngayGiao) || homNayVN();
  const hetHan = ngayHetHan(batDau, yc.soThang);
  const chung = {
    tenantId: nc.tenantId,
    customerId: yc.khachHangId,
    productId: yc.sanPhamId,
    productName: yc.tenHang,
    salesOrderId: yc.donHangId,
    salesOrderItemId: yc.dongDonId,
    deliveryId: yc.phieuXuatId,
    months: yc.soThang,
    startDate: ngayVeDate(batDau),
    endDate: ngayVeDate(hetHan),
    createdBy: nc.hoSo.userId,
  };

  const daTao: string[] = [];
  for (const s of yc.serial) {
    const w = await nc.tx.warranty.create({ data: { ...chung, serialNumberId: s.id, serial: s.serial }, select: { id: true } });
    daTao.push(w.id);
  }
  if (yc.serial.length === 0 && yc.soLuongKhongSerial > 0) {
    const w = await nc.tx.warranty.create({ data: chung, select: { id: true } });
    daTao.push(w.id);
  }

  if (daTao.length > 0) {
    await nc.suKien({
      eventType: SU_KIEN.WARRANTY_CREATED,
      objectType: "warranty",
      objectId: daTao[0],
      payload: { soPhieu: daTao.length, tenHang: yc.tenHang, soThang: yc.soThang, hetHan },
    });
  }
  return { soPhieu: daTao.length, hetHan };
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachBaoHanh(nc: NguCanh, boLoc: BoLocBaoHanh) {
  batBuocQuyen(nc.hoSo, "service_desk.view");
  const homNay = homNayVN();
  const nguong = await nguongSapHet(nc);

  const dieuKien: Prisma.WarrantyWhereInput[] = [];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { serial: { contains: boLoc.q, mode: "insensitive" } },
        { productName: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });
  if (boLoc.tinhTrang === "") dieuKien.push({ status: "hieu-luc", endDate: { gte: ngayVeDate(homNay) } });
  else if (boLoc.tinhTrang === "het-han") dieuKien.push({ OR: [{ endDate: { lt: ngayVeDate(homNay) } }, { status: "het-han" }] });
  else if (boLoc.tinhTrang === "sap-het" && nguong !== null) {
    const moc = new Date(Date.now() + nguong * 86_400_000).toISOString().slice(0, 10);
    dieuKien.push({ status: "hieu-luc", endDate: { gte: ngayVeDate(homNay), lte: ngayVeDate(moc) } });
  }

  const where: Prisma.WarrantyWhereInput = { AND: dieuKien };
  const [tong, ds, dem] = await Promise.all([
    nc.tx.warranty.count({ where }),
    nc.tx.warranty.findMany({ where, select: CHON, orderBy: [{ endDate: "asc" }], skip: (boLoc.trang - 1) * boLoc.coTrang, take: boLoc.coTrang }),
    nc.tx.warranty.findMany({ where: { status: "hieu-luc" }, select: { endDate: true } }),
  ]);

  const conHan = dem.filter((w) => dateVeNgay(w.endDate) >= homNay).length;
  const sapHet =
    nguong === null
      ? null
      : dem.filter((w) => {
          const con = soNgayConLai(dateVeNgay(w.endDate), homNay);
          return con >= 0 && con <= nguong;
        }).length;

  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map((w) => baoHanhRa(w, homNay, nguong)),
    nguongSapHetNgay: nguong,
    tomTat: { conHan, sapHet, hetHan: dem.length - conHan },
  };
}

export async function chiTietBaoHanh(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "service_desk.view", { objectType: "warranty", objectId: id });
  const w = await nc.tx.warranty.findFirst({ where: { id }, select: CHON });
  if (!w) throw new LoiKhongTimThay("Bảo hành");
  const nguong = await nguongSapHet(nc);
  const phieu = await nc.tx.supportTicket.findMany({
    where: { warrantyId: id },
    select: { id: true, number: true, title: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    baoHanh: baoHanhRa(w, homNayVN(), nguong),
    phieuHoTro: phieu.map((p) => ({ id: p.id, so: p.number, tieuDe: p.title, trangThai: p.status, taoLuc: p.createdAt })),
  };
}

/** Tra bảo hành theo số sê-ri — dùng khi khách gọi và chỉ đọc được số máy. */
export async function traTheoSerial(nc: NguCanh, serial: string) {
  batBuocQuyen(nc.hoSo, "service_desk.view");
  const cau = serial.trim();
  if (cau.length < 2) return [];
  const homNay = homNayVN();
  const nguong = await nguongSapHet(nc);
  const ds = await nc.tx.warranty.findMany({
    where: { serial: { contains: cau, mode: "insensitive" } },
    select: CHON,
    orderBy: { endDate: "desc" },
    take: 20,
  });
  return ds.map((w) => baoHanhRa(w, homNay, nguong));
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

/** Sửa thời hạn bảo hành (nhập sai số tháng, hãng đổi chính sách…). Luôn phải có lý do (BH-04). */
export async function suaBaoHanh(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaBaoHanh>) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "warranty", objectId: id });
  // Khóa như hủy bảo hành (TV-BH-01): sửa đua hủy thì bên sau thấy "huy" và bị chặn (QA 0.16.1).
  await khoaChungTu(nc.tx, "warranties", id);
  const w = await nc.tx.warranty.findFirst({ where: { id }, select: { id: true, months: true, startDate: true, endDate: true, status: true, note: true } });
  if (!w) throw new LoiKhongTimThay("Bảo hành");
  if (w.status === "huy") throw new LoiNghiepVu("Bảo hành đã hủy thì không sửa được nữa.", 409, "da-huy");
  // Kiểm ngay ở service: lược đồ đã bắt, nhưng đây là chốt chặn cuối (BH-04).
  if (!d.lyDo || d.lyDo.trim().length < 2) throw new LoiDinhDang("lyDo", "Sửa bảo hành phải ghi lý do.");

  const batDau = d.ngayBatDau ?? dateVeNgay(w.startDate);
  const soThang = d.soThang ?? w.months;
  const hetHan = ngayHetHan(batDau, soThang);

  const sau = await nc.tx.warranty.update({
    where: { id },
    data: {
      months: soThang,
      startDate: ngayVeDate(batDau),
      endDate: ngayVeDate(hetHan),
      ...(d.ghiChu !== undefined && { note: d.ghiChu || null }),
    },
    select: CHON,
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "warranty",
    objectId: id,
    before: { soThang: w.months, batDau: dateVeNgay(w.startDate), hetHan: dateVeNgay(w.endDate) },
    after: { soThang, batDau, hetHan, lyDo: d.lyDo },
  });
  return baoHanhRa(sau, homNayVN(), await nguongSapHet(nc));
}

/**
 * Hủy bảo hành (giao nhầm, khách trả hàng). Không xóa — giữ vết.
 *
 * TV-BH-06: bảo hành đã hủy nhả sê-ri (`serial_number_id` → NULL, số sê-ri dạng chữ vẫn giữ ở
 * cột `serial`) — nếu không, máy đó giao lại cho khách khác sẽ vấp khóa duy nhất của sê-ri.
 */
export async function huyBaoHanh(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "warranty", objectId: id });
  await khoaChungTu(nc.tx, "warranties", id);
  const w = await nc.tx.warranty.findFirst({ where: { id }, select: { id: true, status: true, serial: true, serialNumberId: true } });
  if (!w) throw new LoiKhongTimThay("Bảo hành");
  if (w.status === "huy") throw new LoiNghiepVu("Bảo hành này đã hủy rồi.", 409, "da-huy");

  await nc.tx.warranty.update({ where: { id }, data: { status: "huy", cancelledAt: new Date(), note: lyDo, serialNumberId: null } });
  await nc.kiemToan({
    action: "sua", objectType: "warranty", objectId: id,
    before: { trangThai: w.status, serialId: w.serialNumberId }, after: { trangThai: "huy", lyDo, serialId: null, serial: w.serial },
  });
  await nc.suKien({ eventType: SU_KIEN.WARRANTY_CANCELLED, objectType: "warranty", objectId: id, payload: { lyDo, serial: w.serial } });
  return { id, trangThai: "huy" };
}

/**
 * Kết thúc bảo hành của những chiếc máy khách đã trả về (TV-BH-06). Gọi từ xác nhận phiếu
 * trả hàng — người gọi đã kiểm quyền. Bảo hành chuyển `huy`, nhả sê-ri, ghi lý do kèm số phiếu;
 * bảo hành đã hết hạn thì chỉ nhả sê-ri (trạng thái giữ nguyên để báo cáo không nói sai).
 */
export async function ketThucBaoHanhKhiTraHang(nc: NguCanh, serialIds: string[], soPhieu: string): Promise<string[]> {
  if (serialIds.length === 0) return [];
  const timBaoHanh = () =>
    nc.tx.warranty.findMany({
      where: { serialNumberId: { in: serialIds } },
      select: { id: true, status: true, serial: true, note: true, serialNumberId: true, endDate: true },
      orderBy: { id: "asc" },
    });
  const truocKhoa = await timBaoHanh();
  if (truocKhoa.length === 0) return [];
  await khoaChungTu(nc.tx, "warranties", truocKhoa.map((w) => w.id));
  // Đọc lại SAU khi khóa: một lần hủy bằng tay chạy cùng lúc có thể vừa đổi trạng thái / nhả sê-ri.
  const ds = await timBaoHanh();
  const homNay = ngayVeDate(homNayVN());
  const lyDo = `Khách trả máy theo phiếu ${soPhieu} — bảo hành của lần bán này kết thúc.`;
  for (const w of ds) {
    // Đã hết hạn (theo trạng thái hoặc theo ngày) thì chỉ nhả sê-ri, giữ nguyên trạng thái —
    // báo cáo vẫn nói "hết bảo hành", không nói sai là "đã hủy" (TV-BH-06).
    const conHieuLuc = w.status === "hieu-luc" && w.endDate >= homNay;
    await nc.tx.warranty.update({
      where: { id: w.id },
      data: {
        serialNumberId: null,
        ...(conHieuLuc ? { status: "huy", cancelledAt: new Date() } : {}),
        note: [w.note, lyDo].filter(Boolean).join(" · "),
      },
    });
    await nc.kiemToan({
      action: "sua", objectType: "warranty", objectId: w.id,
      before: { trangThai: w.status, serialId: w.serialNumberId },
      after: { trangThai: conHieuLuc ? "huy" : w.status, serialId: null, serial: w.serial, phieuTraHang: soPhieu },
    });
    await nc.suKien({ eventType: SU_KIEN.WARRANTY_CANCELLED, objectType: "warranty", objectId: w.id, payload: { lyDo, serial: w.serial, phieuTraHang: soPhieu } });
  }
  return ds.map((w) => w.id);
}
