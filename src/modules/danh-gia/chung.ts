import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { coQuyen, idNguoiTrongPhamVi, type HoSoQuyen } from "@/lib/phan-quyen";
import { laGiamDoc, napBanDoCapTren } from "./cap-tren";
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
  truongPhongDuocChot: "danh_gia.truong_phong_duoc_chot",
  giamDocPhaiBaoCao: "bao_cao.giam_doc_phai_bao_cao",
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
 * Người mà `hoSo` được XEM đánh giá / báo cáo / nhật ký: phạm vi `danh_gia.view` + cấp dưới trực tiếp +
 * người mình là quản lý hiệu lực (quản lý của họ đã nghỉ, hoặc họ không có quản lý mà mình là Giám đốc —
 * QĐ-132 / QĐ-135) + thực tập sinh mình hướng dẫn + chính mình. Không có `danh_gia.view` → không thấy gì
 * (kể cả của mình) — trợ lý AI rơi vào đây.
 */
export async function nguoiXemDuocDanhGiaCua(tx: ClientTenant, hoSo: HoSoQuyen): Promise<string[] | "tat-ca"> {
  if (!coQuyen(hoSo, "danh_gia.view")) return [];
  const pv = await idNguoiTrongPhamVi(tx, hoSo, "danh_gia.view");
  if (pv === "tat-ca") return "tat-ca";
  const bd = await napBanDoCapTren(tx);
  const hieuLuc = [...bd.quanLy.keys()].filter((id) => bd.quanLyHieuLuc(id) === hoSo.userId);
  const phieuGan = (await tx.evaluation.findMany({ where: { managerId: hoSo.userId, status: { not: "da-chot" } }, select: { userId: true } })).map((x) => x.userId);
  return [...new Set([...pv, hoSo.userId, ...(await capDuoi(tx, hoSo.userId)), ...hieuLuc, ...phieuGan, ...(await thucTapSinhCuaToi(tx, hoSo.userId))])];
}

export async function nguoiXemDuocDanhGia(nc: NguCanh): Promise<string[] | "tat-ca"> {
  return nguoiXemDuocDanhGiaCua(nc.tx, nc.hoSo);
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
 * quản lý trực tiếp, **quản lý hiệu lực** (QĐ-132: người không có quản lý → Giám đốc; quản lý đã nghỉ →
 * cấp trên tiếp theo), người được giao bước chấm (`nguoiGanId`, ví dụ `evaluations.manager_id` sau khi
 * chuyển — QĐ-135), hoặc `danh_gia.update` mà người đó trong phạm vi. Không ai tự chấm mình.
 */
export async function chamDuoc(nc: NguCanh, userId: string, nguoiGanId?: string | null): Promise<boolean> {
  if (userId === nc.hoSo.userId) return false;
  if (nguoiGanId && nguoiGanId === nc.hoSo.userId) return true;
  const hs = await nc.tx.staffProfile.findFirst({ where: { userId }, select: { managerId: true } });
  if (hs?.managerId === nc.hoSo.userId) return true;
  if ((await napBanDoCapTren(nc.tx)).quanLyHieuLuc(userId) === nc.hoSo.userId) return true;
  if (!coQuyen(nc.hoSo, "danh_gia.update")) return false;
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "danh_gia.update");
  return pv === "tat-ca" || pv.includes(userId);
}

/** `danh_gia.approve` mà `userId` nằm trong phạm vi (không gồm chính mình). */
async function coQuyenDuyetDanhGiaTrongPhamVi(nc: NguCanh, userId: string): Promise<boolean> {
  if (userId === nc.hoSo.userId || !coQuyen(nc.hoSo, "danh_gia.approve")) return false;
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "danh_gia.approve");
  return pv === "tat-ca" || pv.includes(userId);
}

/**
 * Được CHỐT / điều chỉnh phiếu đánh giá của `userId` (QĐ-133): mặc định **chỉ Giám đốc** (vai trò `ceo`
 * có `danh_gia.approve`). Cấu hình `danh_gia.truong_phong_duoc_chot` = 1 thì người có `danh_gia.approve`
 * mà `userId` trong phạm vi cũng chốt được. Không ai tự chốt phiếu của mình.
 */
export async function chotDuoc(nc: NguCanh, userId: string, cauHinh?: Pick<CauHinhDanhGia, "truongPhongDuocChot">): Promise<boolean> {
  if (!(await coQuyenDuyetDanhGiaTrongPhamVi(nc, userId))) return false;
  if (laGiamDoc(nc.hoSo)) return true;
  const ch = cauHinh ?? (await docCauHinhDanhGia(nc.tx));
  return ch.truongPhongDuocChot === 1;
}

/**
 * Được điều chỉnh ĐIỂM VIỆC (DG-32) của người làm `userId` ngoài người duyệt cấp cuối: `danh_gia.approve`
 * trong phạm vi (trưởng phòng, Giám đốc) — luật 0.20.0 giữ nguyên, không theo cấu hình chốt phiếu.
 */
export async function dieuChinhDiemViecDuoc(nc: NguCanh, userId: string): Promise<boolean> {
  return coQuyenDuyetDanhGiaTrongPhamVi(nc, userId);
}
