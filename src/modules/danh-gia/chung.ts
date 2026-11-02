import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { luocDoGiaTri, timMuc } from "@/modules/cau-hinh/danh-muc";
import type { BangXepLoai, CauHinhBaoCao, CauHinhDungHan } from "./tinh-toan";

/**
 * Phần dùng chung của 0.20.0: đọc Cấu hình (một truy vấn), phạm vi xem / chấm đánh giá.
 * Luật: BUSINESS_RULES.md mục 31.
 */

const KHOA = {
  hanNhanGio: "cong_viec.han_nhan_gio",
  hanDuyetGio: "cong_viec.han_duyet_gio",
  heSoDungHan: "danh_gia.he_so_dung_han",
  treNheToiDaGio: "danh_gia.tre_nhe_toi_da_gio",
  heSoTreNhe: "danh_gia.he_so_tre_nhe",
  heSoTreNang: "danh_gia.he_so_tre_nang",
  heSoKhongHan: "danh_gia.he_so_khong_han",
  hanTuanThu: "bao_cao.han_tuan_thu",
  hanTuanGio: "bao_cao.han_tuan_gio",
  hanNgayGio: "bao_cao.han_ngay_gio",
  nhacTruocGio: "bao_cao.nhac_truoc_gio",
  kyThang: "danh_gia.ky_thang",
  tranDatPhanTram: "danh_gia.tran_dat_phan_tram",
  nguongA: "danh_gia.nguong_a",
  nguongB: "danh_gia.nguong_b",
  nguongC: "danh_gia.nguong_c",
  heSoA: "danh_gia.he_so_thuong_a",
  heSoB: "danh_gia.he_so_thuong_b",
  heSoC: "danh_gia.he_so_thuong_c",
  heSoD: "danh_gia.he_so_thuong_d",
} as const;

export type CauHinhDanhGia = { -readonly [K in keyof typeof KHOA]: number };

/** Mọi khóa 0.20.0 đều có mặc định ≠ null trong danh mục. Giá trị sai lược đồ → mặc định. */
export async function docCauHinhDanhGia(tx: ClientTenant): Promise<CauHinhDanhGia> {
  const dong = await tx.tenantSetting.findMany({ where: { key: { in: Object.values(KHOA) }, status: "hoat-dong" }, select: { key: true, value: true } });
  const bang = new Map(dong.map((d) => [d.key, d.value]));
  const kq = {} as CauHinhDanhGia;
  for (const [ten, khoa] of Object.entries(KHOA) as [keyof CauHinhDanhGia, string][]) {
    const muc = timMuc(khoa);
    if (!muc || muc.macDinh === null) throw new Error(`Khóa cấu hình thiếu mặc định: ${khoa}`);
    const gt = bang.get(khoa);
    const hop = gt === undefined ? null : luocDoGiaTri(muc).safeParse(gt);
    kq[ten] = hop?.success && hop.data !== null ? hop.data : muc.macDinh;
  }
  return kq;
}

export const dungHanTu = (c: CauHinhDanhGia): CauHinhDungHan => ({
  heSoDungHan: c.heSoDungHan,
  heSoTreNhe: c.heSoTreNhe,
  heSoTreNang: c.heSoTreNang,
  heSoKhongHan: c.heSoKhongHan,
  treNheToiDaGio: c.treNheToiDaGio,
});
export const baoCaoTu = (c: CauHinhDanhGia): CauHinhBaoCao => ({
  hanTuanThu: c.hanTuanThu,
  hanTuanGio: c.hanTuanGio,
  hanNgayGio: c.hanNgayGio,
  nhacTruocGio: c.nhacTruocGio,
});
export const xepLoaiTu = (c: CauHinhDanhGia): BangXepLoai => ({
  nguongA: c.nguongA,
  nguongB: c.nguongB,
  nguongC: c.nguongC,
  heSoA: c.heSoA,
  heSoB: c.heSoB,
  heSoC: c.heSoC,
  heSoD: c.heSoD,
});

// ---------------------------------------------------------------------------
// Phạm vi (DG-80)
// ---------------------------------------------------------------------------

/** Cấp dưới trực tiếp (staff_profiles.manager_id) — quản lý trực tiếp luôn xem / chấm được họ. */
export async function capDuoi(tx: ClientTenant, userId: string): Promise<string[]> {
  return (await tx.staffProfile.findMany({ where: { managerId: userId }, select: { userId: true } })).map((x) => x.userId);
}

/** Thực tập sinh mình hướng dẫn (intern_profiles.mentor_id). */
export async function thucTapSinhCuaToi(tx: ClientTenant, userId: string): Promise<string[]> {
  return (await tx.internProfile.findMany({ where: { mentorId: userId }, select: { userId: true } })).map((x) => x.userId);
}

/**
 * Người mà người đang thao tác được XEM đánh giá / báo cáo / nhật ký: phạm vi `danh_gia.view` + cấp dưới
 * trực tiếp + thực tập sinh mình hướng dẫn + chính mình. Không có `danh_gia.view` → không thấy gì (kể cả
 * của mình) — trợ lý AI rơi vào đây.
 */
export async function nguoiXemDuocDanhGia(nc: NguCanh): Promise<string[] | "tat-ca"> {
  if (!coQuyen(nc.hoSo, "danh_gia.view")) return [];
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "danh_gia.view");
  if (pv === "tat-ca") return "tat-ca";
  return [...new Set([...pv, nc.hoSo.userId, ...(await capDuoi(nc.tx, nc.hoSo.userId)), ...(await thucTapSinhCuaToi(nc.tx, nc.hoSo.userId))])];
}

export async function xemDuocDanhGiaCua(nc: NguCanh, userId: string): Promise<boolean> {
  const pv = await nguoiXemDuocDanhGia(nc);
  return pv === "tat-ca" || pv.includes(userId);
}

/** Điều kiện Prisma lọc bản ghi có cột `userId` theo phạm vi xem đánh giá. */
export async function locNguoiDanhGia(nc: NguCanh): Promise<{ userId?: { in: string[] } }> {
  const pv = await nguoiXemDuocDanhGia(nc);
  return pv === "tat-ca" ? {} : { userId: { in: pv } };
}

/**
 * Được CHẤM (quản lý chấm chỉ tiêu tay, nhận xét báo cáo, chuyển vướng mắc thành việc) người `userId`:
 * quản lý trực tiếp, hoặc `danh_gia.update` mà người đó trong phạm vi. Không ai tự chấm mình.
 */
export async function chamDuoc(nc: NguCanh, userId: string): Promise<boolean> {
  if (userId === nc.hoSo.userId) return false;
  const hs = await nc.tx.staffProfile.findFirst({ where: { userId }, select: { managerId: true } });
  if (hs?.managerId === nc.hoSo.userId) return true;
  if (!coQuyen(nc.hoSo, "danh_gia.update")) return false;
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "danh_gia.update");
  return pv === "tat-ca" || pv.includes(userId);
}

/** Được CHỐT phiếu của `userId`: `danh_gia.approve` trong phạm vi; không ai tự chốt phiếu của mình. */
export async function chotDuoc(nc: NguCanh, userId: string): Promise<boolean> {
  if (userId === nc.hoSo.userId || !coQuyen(nc.hoSo, "danh_gia.approve")) return false;
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "danh_gia.approve");
  return pv === "tat-ca" || pv.includes(userId);
}
