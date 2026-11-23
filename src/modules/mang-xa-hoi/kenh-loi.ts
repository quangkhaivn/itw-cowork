import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { nguoiGiuQuyen, taoThongBao } from "@/modules/thong-bao/service";
import {
  batBuocChuyen, canDuyet, chiTietBai, duocSoan, kenhSuaCanDuyet, kiemNoiDung, lanGuiCuaKenh, layBai, xepHangKenhLoi, type Bai,
} from "./bai";
import { chuanHoaDsHashtag, suaKenhLoiAnToan } from "./bien-the";
import { ghiDongTacGiaAnh } from "./chung";
import type { LuocDoSuaKenhLoi } from "./luoc-do";

/**
 * Sửa / đăng lại RIÊNG từng kênh lỗi của bài đăng lỗi một phần (0.25.0, QĐ-234 — thực hiện QĐ-216 d).
 *
 *  - Chỉ kênh đang LỖI; kênh đã đăng / cần kiểm tay / đang chạy không bị đụng (trigger CSDL chặn thêm một lớp).
 *  - Sửa nội dung kênh lỗi chỉ khi an toàn với "không bao giờ đăng trùng" (`suaKenhLoiAnToan`); giữ khóa đối soát + loại
 *    lỗi cũ → worker đối soát TRƯỚC khi gửi.
 *  - Sửa = sửa nội dung sau khi đã duyệt: bài phải duyệt (AI / mọi bài phải duyệt) hoặc người sửa không có quyền đăng →
 *    bài sang CHỜ DUYỆT với phạm vi "kenh-loi" (người sửa là người gửi duyệt + đồng tác giả → không tự duyệt được).
 *    Duyệt xong đăng lại ngay riêng các kênh đó; trả lại / rút → bài về trạng thái lỗi cũ.
 */

async function khoaKenhVaBai(nc: NguCanh, postId: string): Promise<Bai> {
  // Thứ tự khóa như worker / huyLich: kênh-bài → bài (QĐ-209).
  await nc.tx.$queryRaw`SELECT id FROM social_post_targets WHERE post_id = ${postId}::uuid ORDER BY id FOR UPDATE`;
  return layBai(nc, postId, true);
}

function kenhCua(b: Bai, targetId: string) {
  const t = b.targets.find((x) => x.id === targetId);
  if (!t) throw new LoiKhongTimThay("Kênh của bài");
  return t;
}

function batBuocBaiLoi(b: Bai) {
  if (b.status !== "FAILED" && b.status !== "PARTIALLY_FAILED") {
    throw new LoiNghiepVu("Chỉ sửa / đăng lại riêng từng kênh khi bài đăng lỗi (một phần hoặc toàn bộ).", 409, "sai-trang-thai");
  }
}

/** Gửi duyệt lại các kênh lỗi đã sửa (bài FAILED / PARTIALLY_FAILED → PENDING_APPROVAL phạm vi "kenh-loi"). */
async function chuyenChoDuyetKenhLoi(nc: NguCanh, b: Bai, ghiChu: string, bayGio: Date) {
  batBuocChuyen(b, "PENDING_APPROVAL", "gửi duyệt lại");
  await nc.tx.socialPost.update({
    where: { id: b.id },
    data: { status: "PENDING_APPROVAL", reviewScope: "kenh-loi", submittedBy: nc.hoSo.userId, submittedAt: bayGio, publishMode: "ngay", approvedBy: null, approvedAt: null, reviewNote: null, updatedBy: nc.hoSo.userId },
  });
  await nc.tx.socialPostReview.create({ data: { tenantId: nc.tenantId, postId: b.id, action: "gui-duyet", actorId: nc.hoSo.userId, note: ghiChu } });
  const nguoiNhan = (await nguoiGiuQuyen(nc.tx, "mxh.approve", true)).filter((u) => u !== b.createdBy && u !== nc.hoSo.userId);
  const hoatDong = await nc.tx.user.findMany({ where: { id: { in: nguoiNhan }, status: "hoat-dong", isSystem: false }, select: { id: true } });
  for (const u of hoatDong) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: u.id, loai: "mxh-cho-duyet", tieuDe: `Duyệt lại kênh lỗi đã sửa: ${b.title ?? b.body.slice(0, 60)}`,
      duongDan: `/mang-xa-hoi/bai/${b.id}`, doiTuong: "social_post", doiTuongId: b.id, khoaChongTrung: `mxh-cho-duyet:${b.id}:${b.revision}:kenh-loi`,
    });
  }
  await nc.kiemToan({ action: "gui-duyet-kenh-loi-mxh", objectType: "social_post", objectId: b.id, after: { kenh: b.targets.filter((t) => t.retryRequested).map((t) => t.connection.name) } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_SUBMITTED, objectType: "social_post", objectId: b.id, payload: { cheDo: "ngay", phamVi: "kenh-loi" } });
}

/** Bài này sửa kênh lỗi xong có phải duyệt lại không: bài phải duyệt, hoặc người sửa không có quyền đăng. */
async function phaiDuyetLai(nc: NguCanh, b: Bai): Promise<boolean> {
  return (await canDuyet(nc, b)) || !coQuyen(nc.hoSo, "mxh.update");
}

export async function suaKenhLoi(nc: NguCanh, postId: string, targetId: string, d: z.infer<typeof LuocDoSuaKenhLoi>, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const b = await khoaKenhVaBai(nc, postId);
  if (!duocSoan(nc, b)) throw new LoiThieuQuyen("mxh.update", { objectType: "social_post", objectId: postId });
  batBuocBaiLoi(b);
  const t = kenhCua(b, targetId);
  if (t.status !== "FAILED") throw new LoiNghiepVu("Chỉ sửa được kênh đang Lỗi — kênh đã đăng, đang đăng hoặc cần kiểm tay giữ nguyên.", 409, "sai-trang-thai");
  const an = suaKenhLoiAnToan(t.connection.platform, t, (await lanGuiCuaKenh(nc, [t.id])).get(t.id) ?? []);
  if (!an.duoc) throw new LoiNghiepVu(an.lyDo!, 409, "sua-kenh-khong-an-toan");
  const anh = d.anhIds ?? null;
  if (anh && anh.some((id) => !b.media.some((m) => m.attachmentId === id))) {
    throw new LoiNghiepVu("Ảnh / video chọn riêng cho kênh phải là ảnh / video đã chụp của bài.", 422, "anh-khong-thuoc-bai");
  }
  const moi = {
    titleOverride: d.tieuDe?.trim() || null,
    bodyOverride: d.noiDung?.trim() || null,
    hashtags: chuanHoaDsHashtag(d.hashtags ?? []),
    mediaSubset: anh !== null,
    mediaIds: anh ? [...new Set(anh)] : [],
  };
  // Trạng thái dở dang của connector có chứa nội dung cũ (container Instagram có chú thích, phiên tải YouTube có tiêu đề /
  // mô tả) → bỏ để lượt sau dựng lại với nội dung mới. Khóa đối soát + loại lỗi giữ nguyên (đối soát trước khi gửi).
  const daTai = { ...((t.mediaExternal ?? {}) as Record<string, string>) };
  delete daTai.__igContainer;
  delete daTai.__ytPhien;
  await nc.tx.socialPostTarget.update({ where: { id: t.id }, data: { ...moi, retryRequested: true, mediaExternal: daTai, overrideUpdatedBy: nc.hoSo.userId, overrideUpdatedAt: bayGio } });
  // QA 0.25.0 (QĐ-243): nội dung đổi → dấu "đã duyệt" cũ không còn đúng (người duyệt chưa xem bản sửa) — như QĐ-197.
  await nc.tx.socialPost.update({ where: { id: postId }, data: { revision: { increment: 1 }, approvedBy: null, approvedAt: null, reviewNote: null, updatedBy: nc.hoSo.userId } });
  // Sửa nội dung sau khi bài đã gửi duyệt = đồng tác giả (QĐ-203) → không duyệt được bản sửa của chính mình.
  await ghiDongTacGiaAnh(nc.tx, postId, nc.hoSo.userId);
  const sau = await layBai(nc, postId);
  // Kiểm luật nền tảng cho đúng kênh này ngay lúc sửa (lỗi định dạng báo sớm).
  await kiemNoiDung(sau, new Set([t.id]));
  await nc.tx.socialPostReview.create({ data: { tenantId: nc.tenantId, postId, action: "sua-kenh", actorId: nc.hoSo.userId, note: `Sửa nội dung riêng kênh “${t.connection.name}”` } });
  await nc.kiemToan({
    action: "sua-kenh-loi-mxh", objectType: "social_post", objectId: postId,
    before: { kenh: t.connection.name, coTieuDeRieng: Boolean(t.titleOverride), coNoiDungRieng: Boolean(t.bodyOverride), hashtag: t.hashtags.length },
    after: { kenh: t.connection.name, coTieuDeRieng: Boolean(moi.titleOverride), coNoiDungRieng: Boolean(moi.bodyOverride), hashtag: moi.hashtags.length, anhRieng: moi.mediaSubset ? moi.mediaIds.length : null },
  });
  if (await phaiDuyetLai(nc, sau)) await chuyenChoDuyetKenhLoi(nc, sau, `Sửa kênh “${t.connection.name}” — duyệt xong đăng lại riêng kênh lỗi`, bayGio);
  return chiTietBai(nc, postId);
}

/** Gửi duyệt lại các kênh lỗi đã sửa (ví dụ bản sửa bị trả lại rồi sửa tiếp, hoặc Cấu hình duyệt vừa bật). */
export async function guiDuyetKenhLoi(nc: NguCanh, postId: string, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.create", { objectType: "social_post", objectId: postId });
  const b = await khoaKenhVaBai(nc, postId);
  if (!duocSoan(nc, b)) throw new LoiThieuQuyen("mxh.update", { objectType: "social_post", objectId: postId });
  batBuocBaiLoi(b);
  const ds = b.targets.filter((t) => t.status === "FAILED" && t.retryRequested);
  if (!ds.length) throw new LoiNghiepVu("Không có kênh lỗi nào đã sửa để gửi duyệt.", 409, "khong-co-kenh-loi");
  await kiemNoiDung(b, new Set(ds.map((t) => t.id)));
  await chuyenChoDuyetKenhLoi(nc, b, `Duyệt lại ${ds.length} kênh lỗi đã sửa — duyệt xong đăng lại riêng các kênh này`, bayGio);
  return chiTietBai(nc, postId);
}

/** Đăng lại RIÊNG một kênh lỗi (mxh.update). Kênh đã sửa mà bài phải duyệt → phải duyệt lại trước. */
export async function dangLaiKenh(nc: NguCanh, postId: string, targetId: string, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_post", objectId: postId });
  const b = await khoaKenhVaBai(nc, postId);
  batBuocBaiLoi(b);
  const t = kenhCua(b, targetId);
  if (t.status !== "FAILED") throw new LoiNghiepVu("Chỉ đăng lại được kênh đang Lỗi.", 409, "sai-trang-thai");
  if ((await kenhSuaCanDuyet(nc, b, [t])).has(t.id)) {
    throw new LoiNghiepVu(`Kênh “${t.connection.name}” đã sửa nội dung — phải được duyệt lại trước khi đăng (bấm “Gửi duyệt lại kênh lỗi”).`, 409, "can-duyet");
  }
  const kieu = await kiemNoiDung(b, new Set([t.id]));
  await xepHangKenhLoi(nc, b, [t.id], kieu, bayGio);
  await nc.kiemToan({ action: "dang-lai-kenh-mxh", objectType: "social_post", objectId: postId, after: { kenh: t.connection.name, daSua: t.retryRequested } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_SCHEDULED, objectType: "social_post", objectId: postId, payload: { cheDo: "dang-lai-kenh", soKenh: 1 } });
  return chiTietBai(nc, postId);
}
