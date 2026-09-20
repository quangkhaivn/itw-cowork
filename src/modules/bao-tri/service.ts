import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, type KieuSo } from "@/lib/so-chung-tu";
import { dateVeNgay, homNayVN, kiemTraNguoiPhuTrach, ngayVeDate } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { taoCoHoi } from "@/modules/co-hoi/service";
import { LuocDoTaoCoHoi } from "@/modules/co-hoi/luoc-do";
import { kyBaoTriKeTiep, soNgayGiua, tinhTrangBaoTri } from "@/modules/nhac-viec/tinh-toan";
import type {
  BoLocBaoTri,
  BoLocGiaHan,
  DuLieuChotGiaHan,
  DuLieuGhiNhanBaoTri,
  DuLieuSuaHopDongBaoTri,
  DuLieuTaoHopDongBaoTri,
} from "./luoc-do";

/**
 * Hợp đồng bảo trì định kỳ và gia hạn — mục 18 prompt 20/09, phần để lại từ Phase 6.
 * Luật: BUSINESS_RULES.md mục 14.
 *
 * Hai thứ này đi cùng nhau vì cùng một câu hỏi: **cái gì sắp đến hạn và ai phải gọi khách?**
 * Bản quét nhắc việc (Phase 8) đọc hai bảng này mỗi sáng.
 *
 * Gia hạn **không** tự thành cơ hội: hệ thống lập sẵn dòng chờ, người bán xem rồi mới chốt.
 * Máy tự mở cơ hội cho mọi máy sắp hết bảo hành sẽ làm pipeline đầy rác trong một tuần.
 */

const KIEU_SO_BAO_TRI: KieuSo = { loai: "maintenance_contract", tienTo: "BT", doDai: 4, theoNam: true };

export const NHAN_TRANG_THAI_BAO_TRI: Record<string, { nhan: string; lop: string }> = {
  "hieu-luc": { nhan: "Đang hiệu lực", lop: "tot" },
  "tam-dung": { nhan: "Tạm dừng", lop: "canh-bao" },
  "het-han": { nhan: "Hết hạn", lop: "" },
  huy: { nhan: "Đã hủy", lop: "loi" },
};

export const NHAN_TINH_TRANG_KY: Record<string, { nhan: string; lop: string }> = {
  "tre-ky": { nhan: "Trễ kỳ", lop: "loi" },
  "den-ky": { nhan: "Tới kỳ", lop: "canh-bao" },
  "cho-ky-sau": { nhan: "Đúng lịch", lop: "tot" },
  "het-han": { nhan: "Hết kỳ hạn", lop: "" },
  "khong-theo-doi": { nhan: "Không theo dõi", lop: "" },
};

export const NHAN_TRANG_THAI_GIA_HAN: Record<string, { nhan: string; lop: string }> = {
  moi: { nhan: "Chờ chốt", lop: "canh-bao" },
  "da-tao-co-hoi": { nhan: "Đã mở cơ hội", lop: "tot" },
  "bo-qua": { nhan: "Đã bỏ qua", lop: "" },
};

export const NHAN_NGUON_GIA_HAN: Record<string, string> = {
  "bao-hanh": "Bảo hành",
  "bao-tri": "Hợp đồng bảo trì",
};

const CHON = {
  id: true, code: true, name: true, scope: true, startDate: true, endDate: true,
  cycleMonths: true, lastServiceDate: true, nextServiceDate: true, amount: true,
  status: true, note: true, cancelledAt: true, cancelReason: true, ownerId: true,
  createdAt: true, updatedAt: true,
  customer: { select: { id: true, code: true, name: true, phone: true } },
  owner: { select: { id: true, fullName: true } },
} satisfies Prisma.MaintenanceContractSelect;

type BanGhi = Prisma.MaintenanceContractGetPayload<{ select: typeof CHON }>;

function hopDongRa(h: BanGhi, homNay: string) {
  const ky = kyBaoTriKeTiep(
    dateVeNgay(h.startDate),
    dateVeNgay(h.endDate),
    h.cycleMonths,
    h.lastServiceDate ? dateVeNgay(h.lastServiceDate) : null,
  );
  return {
    id: h.id,
    ma: h.code,
    ten: h.name,
    phamVi: h.scope,
    ngayBatDau: h.startDate,
    ngayKetThuc: h.endDate,
    chuKyThang: h.cycleMonths,
    lanBaoTriGanNhat: h.lastServiceDate,
    kyKeTiep: ky,
    soNgayToiKy: ky ? soNgayGiua(homNay, ky) : null,
    tinhTrangKy: tinhTrangBaoTri(h.status, ky, homNay),
    giaTri: h.amount ? h.amount.toString() : null,
    trangThai: h.status,
    ghiChu: h.note,
    huyLuc: h.cancelledAt,
    lyDoHuy: h.cancelReason,
    khachHang: { id: h.customer.id, ma: h.customer.code, ten: h.customer.name, dienThoai: h.customer.phone },
    nguoiPhuTrach: { id: h.owner.id, hoTen: h.owner.fullName },
    taoLuc: h.createdAt,
  };
}

/** Phạm vi xem hợp đồng bảo trì: theo người phụ trách hợp đồng (quyền `service_desk.view`). */
export async function dieuKienXemBaoTri(nc: NguCanh): Promise<Prisma.MaintenanceContractWhereInput> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "service_desk.view");
  if (pv === "tat-ca") return {};
  return { ownerId: { in: pv } };
}

async function docHopDong(nc: NguCanh, id: string): Promise<BanGhi> {
  const h = await nc.tx.maintenanceContract.findFirst({
    where: { AND: [{ id }, await dieuKienXemBaoTri(nc)] },
    select: CHON,
  });
  if (!h) throw new LoiKhongTimThay("Hợp đồng bảo trì");
  return h;
}

// ---------------------------------------------------------------------------
// Đọc — hợp đồng bảo trì
// ---------------------------------------------------------------------------

export async function danhSachHopDongBaoTri(nc: NguCanh, boLoc: BoLocBaoTri) {
  batBuocQuyen(nc.hoSo, "service_desk.view");
  const homNay = homNayVN();
  const dieuKien: Prisma.MaintenanceContractWhereInput[] = [await dieuKienXemBaoTri(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { code: { contains: boLoc.q, mode: "insensitive" } },
        { name: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });
  if (boLoc.trangThai === "") dieuKien.push({ status: "hieu-luc" });
  else if (boLoc.trangThai !== "tat-ca" && boLoc.trangThai !== "den-ky") dieuKien.push({ status: boLoc.trangThai });

  const where: Prisma.MaintenanceContractWhereInput = { AND: dieuKien };
  const [tong, ds] = await Promise.all([
    nc.tx.maintenanceContract.count({ where }),
    nc.tx.maintenanceContract.findMany({
      where,
      orderBy: [{ nextServiceDate: "asc" }, { code: "desc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
      select: CHON,
    }),
  ]);
  let dong = ds.map((h) => hopDongRa(h, homNay));
  // "Tới kỳ" là trạng thái TÍNH, không lưu, nên lọc sau khi tính.
  if (boLoc.trangThai === "den-ky") dong = dong.filter((h) => h.tinhTrangKy === "den-ky" || h.tinhTrangKy === "tre-ky");
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong };
}

export async function chiTietHopDongBaoTri(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "service_desk.view", { objectType: "maintenance_contract", objectId: id });
  const h = await docHopDong(nc, id);
  const homNay = homNayVN();
  const giaHan = await nc.tx.renewal.findMany({
    where: { maintenanceContractId: id },
    orderBy: { dueDate: "desc" },
    select: { id: true, dueDate: true, status: true, opportunityId: true },
  });
  const duocGhi = coQuyen(nc.hoSo, "service_desk.update") && h.status !== "huy";
  return {
    hopDong: hopDongRa(h, homNay),
    giaHan: giaHan.map((g) => ({ id: g.id, denHan: g.dueDate, trangThai: g.status, coHoiId: g.opportunityId })),
    quyen: {
      sua: duocGhi,
      ghiNhanBaoTri: duocGhi && h.status === "hieu-luc",
      huy: coQuyen(nc.hoSo, "service_desk.update") && h.status !== "huy",
    },
  };
}

// ---------------------------------------------------------------------------
// Ghi — hợp đồng bảo trì
// ---------------------------------------------------------------------------

export async function taoHopDongBaoTri(nc: NguCanh, d: DuLieuTaoHopDongBaoTri) {
  batBuocQuyen(nc.hoSo, "service_desk.create", { objectType: "maintenance_contract" });
  const khach = await batBuocThayKhach(nc, d.khachHangId);
  if (d.ngayKetThuc < d.ngayBatDau) throw new LoiDinhDang("ngayKetThuc", "Ngày kết thúc không được trước ngày bắt đầu.");

  const ownerId = d.nguoiPhuTrachId || nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "service_desk.create", ownerId);

  const ma = await capSoChungTu(nc.tx, KIEU_SO_BAO_TRI);
  const ky = kyBaoTriKeTiep(d.ngayBatDau, d.ngayKetThuc, d.chuKyThang, null);
  const h = await nc.tx.maintenanceContract.create({
    data: {
      tenantId: nc.tenantId,
      code: ma,
      customerId: khach.id,
      ownerId,
      name: d.ten,
      scope: d.phamVi || null,
      startDate: ngayVeDate(d.ngayBatDau),
      endDate: ngayVeDate(d.ngayKetThuc),
      cycleMonths: d.chuKyThang,
      nextServiceDate: ky ? ngayVeDate(ky) : null,
      amount: d.giaTri && d.giaTri !== "0" ? d.giaTri : null,
      note: d.ghiChu || null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, code: true },
  });

  await nc.kiemToan({
    action: "tao",
    objectType: "maintenance_contract",
    objectId: h.id,
    after: { ma, khachHangId: khach.id, chuKyThang: d.chuKyThang, kyKeTiep: ky },
  });
  await nc.suKien({
    eventType: SU_KIEN.MAINTENANCE_CONTRACT_CREATED,
    objectType: "maintenance_contract",
    objectId: h.id,
    payload: { ma, khachHangId: khach.id },
  });
  return { id: h.id, ma };
}

export async function suaHopDongBaoTri(nc: NguCanh, id: string, d: DuLieuSuaHopDongBaoTri) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "maintenance_contract", objectId: id });
  const h = await docHopDong(nc, id);
  if (h.status === "huy") throw new LoiNghiepVu("Hợp đồng đã hủy thì không sửa được.", 409, "da-huy");

  const ngayKetThuc = d.ngayKetThuc || dateVeNgay(h.endDate);
  if (ngayKetThuc < dateVeNgay(h.startDate)) {
    throw new LoiDinhDang("ngayKetThuc", "Ngày kết thúc không được trước ngày bắt đầu.");
  }
  if (d.nguoiPhuTrachId) await kiemTraNguoiPhuTrach(nc, "service_desk.update", d.nguoiPhuTrachId);

  const chuKy = d.chuKyThang ?? h.cycleMonths;
  const ky = kyBaoTriKeTiep(
    dateVeNgay(h.startDate),
    ngayKetThuc,
    chuKy,
    h.lastServiceDate ? dateVeNgay(h.lastServiceDate) : null,
  );
  await nc.tx.maintenanceContract.update({
    where: { id },
    data: {
      ...(d.ten !== undefined && d.ten ? { name: d.ten } : {}),
      ...(d.phamVi !== undefined ? { scope: d.phamVi || null } : {}),
      ...(d.ngayKetThuc ? { endDate: ngayVeDate(d.ngayKetThuc) } : {}),
      ...(d.chuKyThang !== undefined ? { cycleMonths: d.chuKyThang } : {}),
      ...(d.giaTri !== undefined ? { amount: d.giaTri && d.giaTri !== "0" ? d.giaTri : null } : {}),
      ...(d.nguoiPhuTrachId ? { ownerId: d.nguoiPhuTrachId } : {}),
      ...(d.ghiChu !== undefined ? { note: d.ghiChu || null } : {}),
      ...(d.trangThai ? { status: d.trangThai } : {}),
      nextServiceDate: ky ? ngayVeDate(ky) : null,
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "maintenance_contract",
    objectId: id,
    before: { chuKyThang: h.cycleMonths, trangThai: h.status },
    after: { chuKyThang: chuKy, trangThai: d.trangThai ?? h.status },
  });
  return { id };
}

/**
 * Ghi nhận đã bảo trì xong một kỳ. Mốc kỳ kế tiếp đẩy lên theo chu kỳ — đây là chỗ duy
 * nhất được đổi `lastServiceDate`, để lịch bảo trì không bị sửa lén.
 */
export async function ghiNhanBaoTri(nc: NguCanh, id: string, d: DuLieuGhiNhanBaoTri) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "maintenance_contract", objectId: id });
  const h = await docHopDong(nc, id);
  if (h.status !== "hieu-luc") throw new LoiNghiepVu("Chỉ ghi nhận bảo trì cho hợp đồng đang hiệu lực.", 409, "sai-trang-thai");

  const ngay = d.ngayBaoTri || homNayVN();
  if (ngay < dateVeNgay(h.startDate)) {
    throw new LoiDinhDang("ngayBaoTri", "Ngày bảo trì không được trước ngày bắt đầu hợp đồng.");
  }
  if (ngay > homNayVN()) throw new LoiDinhDang("ngayBaoTri", "Không ghi nhận bảo trì cho ngày ở tương lai.");

  const ky = kyBaoTriKeTiep(dateVeNgay(h.startDate), dateVeNgay(h.endDate), h.cycleMonths, ngay);
  await nc.tx.maintenanceContract.update({
    where: { id },
    data: {
      lastServiceDate: ngayVeDate(ngay),
      nextServiceDate: ky ? ngayVeDate(ky) : null,
      // Hết kỳ cuối thì hợp đồng tự chuyển sang Hết hạn — không để nó nằm mãi ở Hiệu lực.
      ...(ky ? {} : { status: "het-han" }),
      ...(d.ghiChu ? { note: d.ghiChu } : {}),
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "maintenance_contract",
    objectId: id,
    before: { lanGanNhat: h.lastServiceDate, kyKeTiep: h.nextServiceDate },
    after: { lanGanNhat: ngay, kyKeTiep: ky },
  });
  await nc.suKien({
    eventType: SU_KIEN.MAINTENANCE_SERVICED,
    objectType: "maintenance_contract",
    objectId: id,
    payload: { ma: h.code, ngay, kyKeTiep: ky },
  });
  return { id, ngayBaoTri: ngay, kyKeTiep: ky };
}

export async function huyHopDongBaoTri(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "service_desk.update", { objectType: "maintenance_contract", objectId: id });
  const h = await docHopDong(nc, id);
  if (h.status === "huy") throw new LoiNghiepVu("Hợp đồng này đã hủy rồi.", 409, "da-huy");
  await nc.tx.maintenanceContract.update({
    where: { id },
    data: { status: "huy", cancelledAt: new Date(), cancelReason: lyDo, nextServiceDate: null, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "maintenance_contract",
    objectId: id,
    before: { trangThai: h.status },
    after: { trangThai: "huy", lyDo },
  });
  return { id, trangThai: "huy" };
}

// ---------------------------------------------------------------------------
// Gia hạn
// ---------------------------------------------------------------------------

const CHON_GH = {
  id: true, sourceType: true, title: true, dueDate: true, status: true, note: true,
  skipReason: true, opportunityId: true, ownerId: true, createdAt: true,
  customer: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, fullName: true } },
  warranty: { select: { id: true, serial: true, productName: true, endDate: true } },
  maintenanceContract: { select: { id: true, code: true, name: true } },
  opportunity: { select: { id: true, code: true, stage: true } },
} satisfies Prisma.RenewalSelect;

/**
 * Ai được xem lịch gia hạn: người lo dịch vụ (`service_desk.view`) HOẶC người bán
 * (`sales.view`) — bán gia hạn là việc của kinh doanh. Cố ý kiểm ở service chứ không
 * cấp `service_desk.view` cho vai trò Kinh doanh, vì cấp thế sẽ mở luôn cả hàng đợi
 * phiếu hỗ trợ cho họ.
 */
export function batBuocQuyenGiaHan(nc: NguCanh) {
  if (coQuyen(nc.hoSo, "service_desk.view")) return;
  batBuocQuyen(nc.hoSo, "sales.view", { objectType: "renewal" });
}

export async function dieuKienXemGiaHan(nc: NguCanh): Promise<Prisma.RenewalWhereInput> {
  const maQuyen = coQuyen(nc.hoSo, "service_desk.view") ? "service_desk.view" : "sales.view";
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, maQuyen);
  if (pv === "tat-ca") return {};
  // Gia hạn không có người phụ trách thì ai nhìn được khách đó sẽ nhìn được — QĐ-13.
  const pvKhach = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "customer.view");
  return {
    OR: [
      { ownerId: { in: pv } },
      ...(pvKhach === "tat-ca" ? [{}] : [{ customer: { ownerId: { in: pvKhach } } }]),
    ],
  };
}

export async function danhSachGiaHan(nc: NguCanh, boLoc: BoLocGiaHan) {
  batBuocQuyenGiaHan(nc);
  const homNay = homNayVN();
  const dieuKien: Prisma.RenewalWhereInput[] = [await dieuKienXemGiaHan(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { title: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.nguon) dieuKien.push({ sourceType: boLoc.nguon });
  if (boLoc.trangThai === "") dieuKien.push({ status: "moi" });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });

  const where: Prisma.RenewalWhereInput = { AND: dieuKien };
  const [tong, ds] = await Promise.all([
    nc.tx.renewal.count({ where }),
    nc.tx.renewal.findMany({
      where,
      orderBy: [{ dueDate: "asc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
      select: CHON_GH,
    }),
  ]);
  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map((g) => ({
      id: g.id,
      nguon: g.sourceType,
      tieuDe: g.title,
      denHan: g.dueDate,
      soNgayConLai: soNgayGiua(homNay, dateVeNgay(g.dueDate)),
      trangThai: g.status,
      ghiChu: g.note,
      lyDoBoQua: g.skipReason,
      khachHang: { id: g.customer.id, ma: g.customer.code, ten: g.customer.name },
      nguoiPhuTrach: g.owner ? { id: g.owner.id, hoTen: g.owner.fullName } : null,
      baoHanh: g.warranty ? { id: g.warranty.id, serial: g.warranty.serial, ten: g.warranty.productName } : null,
      hopDongBaoTri: g.maintenanceContract
        ? { id: g.maintenanceContract.id, ma: g.maintenanceContract.code, ten: g.maintenanceContract.name }
        : null,
      coHoi: g.opportunity ? { id: g.opportunity.id, ma: g.opportunity.code, giaiDoan: g.opportunity.stage } : null,
    })),
  };
}

async function docGiaHan(nc: NguCanh, id: string) {
  const g = await nc.tx.renewal.findFirst({
    where: { AND: [{ id }, await dieuKienXemGiaHan(nc)] },
    select: CHON_GH,
  });
  if (!g) throw new LoiKhongTimThay("Dòng gia hạn");
  return g;
}

/**
 * Chốt một dòng gia hạn thành cơ hội bán hàng. Cơ hội đi qua `taoCoHoi()` như mọi cơ hội
 * khác — cùng kiểm quyền, cùng cấp mã, cùng ghi nhật ký. Không có đường tắt riêng.
 */
export async function chotGiaHan(nc: NguCanh, id: string, d: DuLieuChotGiaHan) {
  batBuocQuyen(nc.hoSo, "sales.create", { objectType: "renewal", objectId: id });
  const g = await docGiaHan(nc, id);
  if (g.status !== "moi") throw new LoiNghiepVu("Dòng gia hạn này đã xử lý rồi.", 409, "da-xu-ly");

  const coHoi = await taoCoHoi(
    nc,
    LuocDoTaoCoHoi.parse({
      khachHangId: g.customer.id,
      tieuDe: d.tieuDe || g.title,
      moTa: `Tự động từ lịch gia hạn (${NHAN_NGUON_GIA_HAN[g.sourceType] ?? g.sourceType}), đến hạn ${dateVeNgay(g.dueDate)}.`,
      giaTri: d.giaTri ?? "0",
      nguoiPhuTrachId: d.nguoiPhuTrachId || g.ownerId || nc.hoSo.userId,
      hanhDongKeTiep: d.hanhDongKeTiep,
      ngayHanhDong: d.ngayHanhDong,
    }),
  );

  await nc.tx.renewal.update({
    where: { id },
    data: { status: "da-tao-co-hoi", opportunityId: coHoi.id, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "renewal",
    objectId: id,
    before: { trangThai: "moi" },
    after: { trangThai: "da-tao-co-hoi", coHoiId: coHoi.id },
  });
  await nc.suKien({
    eventType: SU_KIEN.RENEWAL_CONVERTED,
    objectType: "renewal",
    objectId: id,
    payload: { coHoiId: coHoi.id, nguon: g.sourceType },
  });
  return { id, coHoiId: coHoi.id, maCoHoi: coHoi.ma };
}

export async function boQuaGiaHan(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyenGiaHan(nc);
  const g = await docGiaHan(nc, id);
  if (g.status !== "moi") throw new LoiNghiepVu("Dòng gia hạn này đã xử lý rồi.", 409, "da-xu-ly");
  await nc.tx.renewal.update({
    where: { id },
    data: { status: "bo-qua", skipReason: lyDo, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "renewal",
    objectId: id,
    before: { trangThai: "moi" },
    after: { trangThai: "bo-qua", lyDo },
  });
  return { id, trangThai: "bo-qua" };
}
