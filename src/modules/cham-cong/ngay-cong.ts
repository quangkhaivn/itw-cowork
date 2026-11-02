import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { ngayVeDate } from "@/modules/crm/chung";
import { taoThongBao } from "@/modules/thong-bao/service";
import { banDoTen, capDuoiTrucTiep, coTheDuyet, docCauHinhChamCong, kiemDuocDuyet } from "./chung";
import type { LuocDoXetNgayCong } from "./luoc-do";
import { tinhCong } from "./tinh-cong";
import { CO_NGAY, congNgay, ngayVNCua } from "./tinh-toan";

/**
 * Ngày công "thiếu giờ" (QĐ-116): có cả giờ vào lẫn giờ ra nhưng thời gian có mặt dưới
 * `cham_cong.co_mat_toi_thieu_phan_tram` giờ phải làm. Không tự trừ công — vào hàng chờ, quản lý trực tiếp /
 * người có `cham_cong.approve` trong phạm vi quyết tính ĐỦ, NỬA hay KHÔNG công. Quyết định chỉ ghi thêm,
 * mới nhất có hiệu lực; bảng công (kể cả dòng điều chỉnh kỳ đã khóa) đọc quyết định này khi sinh.
 */

/** Số ngày lùi lại của hàng chờ (tới hôm qua — ngày hôm nay chưa xong, có thể còn chấm thêm). */
const HANG_CHO_SO_NGAY = 35;

export const NHAN_QUYET_DINH_NGAY: Record<"du" | "nua" | "khong", string> = { du: "Tính đủ công", nua: "Tính nửa công", khong: "Không tính công" };

/** Ngày thiếu giờ CHƯA được xét của những người mà người xem được duyệt (không gồm chính mình). */
export async function ngayThieuGioCanXemXet(nc: NguCanh, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const capDuoi = await capDuoiTrucTiep(nc.tx, nc.hoSo.userId);
  if (!coQuyen(nc.hoSo, "cham_cong.approve") && capDuoi.length === 0) return [];
  const pv = coQuyen(nc.hoSo, "cham_cong.approve") ? await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "cham_cong.approve") : [];
  let ids: string[];
  if (pv === "tat-ca") {
    const u = await nc.tx.user.findMany({ where: { isSystem: false }, select: { id: true } });
    ids = u.map((x) => x.id);
  } else {
    ids = [...new Set([...pv, ...capDuoi])];
  }
  ids = ids.filter((x) => x !== nc.hoSo.userId);
  const homQua = congNgay(ngayVNCua(bayGio), -1);
  const tu = congNgay(homQua, -(HANG_CHO_SO_NGAY - 1));
  const cacNgay: string[] = [];
  for (let d = tu; d <= homQua; d = congNgay(d, 1)) cacNgay.push(d);
  const ch = await docCauHinhChamCong(nc.tx);
  const dong = (await tinhCong(nc.tx, ch, ids, cacNgay)).filter((r) => r.co.includes(CO_NGAY.thieuGioChoXet));
  const ten = await banDoTen(nc.tx, dong.map((r) => r.userId));
  const kq = [];
  const duoc = new Map<string, boolean>();
  for (const r of dong) {
    if (!duoc.has(r.userId)) duoc.set(r.userId, await coTheDuyet(nc, r.userId));
    if (!duoc.get(r.userId)) continue;
    kq.push({
      nguoi: { id: r.userId, hoTen: ten.get(r.userId) ?? "—" },
      ngay: r.ngay,
      vaoDau: r.vaoDau,
      raCuoi: r.raCuoi,
      phutCoMat: r.phutCoMat,
      phutPhaiCoMat: r.phutPhaiCoMat,
      congThucTe: r.congThucTe,
      congDuKien: r.congDuKien,
      /** Ngày chỉ phải làm nửa ca: "nửa công" không áp dụng (chọn đủ hoặc không). */
      choNua: r.congThucTe >= 1,
    });
  }
  return kq.sort((a, b) => (a.ngay === b.ngay ? a.nguoi.hoTen.localeCompare(b.nguoi.hoTen, "vi") : a.ngay < b.ngay ? 1 : -1));
}

/** Quản lý xét một ngày thiếu giờ: đủ / nửa / không công (không công bắt buộc lý do). Không tự xét của mình. */
export async function xetNgayThieuGio(nc: NguCanh, d: z.infer<typeof LuocDoXetNgayCong>, bayGio = new Date()) {
  if (d.nguoiId === nc.hoSo.userId) {
    throw new LoiNghiepVu("Không tự xét ngày công của chính mình — quản lý trực tiếp hoặc Nhân sự khác xét.", 403, "khong-tu-duyet");
  }
  await kiemDuocDuyet(nc, d.nguoiId, { objectType: "attendance_day", objectId: `${d.nguoiId}:${d.ngay}` });
  if (d.ngay >= ngayVNCua(bayGio)) throw new LoiNghiepVu("Chỉ xét ngày đã qua — hôm nay nhân viên còn có thể chấm thêm.", 422, "chua-het-ngay");
  if (d.quyetDinh === "khong" && (!d.ghiChu || d.ghiChu.length < 2)) throw new LoiNghiepVu("Không tính công thì ghi lý do để nhân viên biết.", 422, "thieu-ly-do");
  // Tính lại đúng ngày đó TRƯỚC quyết định mới (bỏ qua quyết định cũ nếu có) để chắc ngày còn thiếu giờ.
  const ch = await docCauHinhChamCong(nc.tx);
  const [dong] = (await tinhCong(nc.tx, ch, [d.nguoiId], [d.ngay])).filter((r) => r.ngay === d.ngay);
  if (!dong || !dong.co.includes(CO_NGAY.thieuGio)) throw new LoiNghiepVu("Ngày này không bị gắn cờ thiếu giờ.", 422, "khong-thieu-gio");
  // Giá trị gốc (chưa áp quyết định) = công phải làm sau nghỉ phép; nửa công chỉ khi ngày phải làm cả ca.
  const goc = dong.congDuKien - dong.nghiNgay;
  if (d.quyetDinh === "nua" && goc < 1) throw new LoiNghiepVu("Ngày này chỉ phải làm nửa ca — chọn tính đủ hoặc không tính công.", 422, "khong-tinh-nua");
  const r = await nc.tx.attendanceDayReview.create({
    data: { tenantId: nc.tenantId, userId: d.nguoiId, workDate: ngayVeDate(d.ngay), decision: d.quyetDinh, note: d.ghiChu, reviewedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "xet-ngay-thieu-gio", objectType: "attendance_day_review", objectId: r.id, after: { nguoiId: d.nguoiId, ngay: d.ngay, quyetDinh: d.quyetDinh, ghiChu: d.ghiChu, phutCoMat: dong.phutCoMat, phutPhaiCoMat: dong.phutPhaiCoMat } });
  await nc.suKien({ eventType: SU_KIEN.ATTENDANCE_DAY_REVIEWED, objectType: "user", objectId: d.nguoiId, payload: { ngay: d.ngay, quyetDinh: d.quyetDinh } });
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: d.nguoiId,
    loai: "cham-cong-ngay-da-xet",
    mucDo: d.quyetDinh === "du" ? "thong-tin" : "canh-bao",
    tieuDe: `Ngày ${d.ngay.split("-").reverse().join("/")} (thiếu giờ): ${NHAN_QUYET_DINH_NGAY[d.quyetDinh].toLowerCase()}`,
    noiDung: d.ghiChu,
    duongDan: "/cham-cong",
    doiTuong: "attendance_day_review",
    doiTuongId: r.id,
    khoaChongTrung: `cham-cong-ngay-da-xet:${r.id}`,
  });
  return { id: r.id, quyetDinh: d.quyetDinh };
}
