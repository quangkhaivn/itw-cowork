import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { chiTietBai, docHenLuc, duocSoan, kiemHanMucReels, layBai } from "./bai";
import { dieuKienXemBai } from "./chung";
import { TEN_NEN_TANG, type TrangThaiBai, type TrangThaiKenhBai } from "./hang-so";
import { kiemHanMucYoutube } from "./han-muc-lich";
import { doiLichDuoc, ghepNgayGio, gioVN, khungThang, khungTuan, mocLichCuaBai, ngayVN, trangThaiLich, type KhungLich } from "./lich-thuan";
import type { LuocDoDoiLich, LuocDoLocLich } from "./luoc-do";

/**
 * Lịch nội dung (0.25.0, QĐ-230 / QĐ-231): xem tháng / tuần (giờ Việt Nam), lọc theo kênh / chiến dịch / người soạn;
 * kéo-thả hoặc sửa để đổi lịch — máy chủ kiểm: không đổi bài đã đăng / đang đăng / lỗi, giờ mới ở tương lai (≤ 1 năm),
 * hạn mức theo kênh (YouTube / ngày quota, Reels Facebook / 24 giờ). Bài đã hẹn giờ đổi giờ KHÔNG mất duyệt (không đổi
 * nội dung); bài chưa hẹn giờ chỉ đổi NGÀY DỰ KIẾN.
 */

export function khungLich(loc: z.infer<typeof LuocDoLocLich>, bayGio: Date = new Date()): KhungLich {
  const k = loc.kieu === "tuan" ? khungTuan(loc.ngay ?? ngayVN(bayGio)) : khungThang(loc.thang ?? ngayVN(bayGio).slice(0, 7));
  if (!k) throw new LoiNghiepVu("Tháng / ngày không hợp lệ.", 400, "sai-ngay");
  return k;
}

/** Quyền kéo / đổi lịch một bài (giao diện ẩn nút; máy chủ kiểm lại ở doiLich). */
function duocDoiLich(nc: NguCanh, b: { status: string; createdBy: string; submittedBy: string | null }): boolean {
  if (!doiLichDuoc(b.status as TrangThaiBai).duoc) return false;
  if (b.status === "SCHEDULED") return coQuyen(nc.hoSo, "mxh.update");
  if (b.status === "PENDING_APPROVAL") return duocSoan(nc, b) || b.submittedBy === nc.hoSo.userId;
  return duocSoan(nc, b);
}

export async function lichNoiDung(nc: NguCanh, loc: z.infer<typeof LuocDoLocLich>, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const k = khungLich(loc, bayGio);
  const ds = await nc.tx.socialPost.findMany({
    where: {
      AND: [
        { deletedAt: null },
        await dieuKienXemBai(nc),
        { OR: [{ scheduledAt: { gte: k.tu, lt: k.den } }, { scheduledAt: null, plannedAt: { gte: k.tu, lt: k.den } }] },
        loc.kenhId ? { targets: { some: { connectionId: loc.kenhId } } } : {},
        loc.chienDichId ? { campaignId: loc.chienDichId } : {},
        loc.nguoiSoanId ? { createdBy: loc.nguoiSoanId } : {},
      ],
    },
    select: {
      id: true, title: true, body: true, status: true, scheduledAt: true, plannedAt: true, createdBy: true, submittedBy: true, createdByType: true, needsReschedule: true, reviewScope: true,
      campaign: { select: { id: true, name: true } },
      targets: { select: { status: true, connection: { select: { id: true, name: true, platform: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ scheduledAt: "asc" }, { plannedAt: "asc" }, { id: "asc" }],
    take: 1000,
  });
  const ten = new Map((await nc.tx.user.findMany({ where: { id: { in: [...new Set(ds.map((b) => b.createdBy))] } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  const muc = ds.map((b) => {
    const luc = mocLichCuaBai(b)!;
    return {
      id: b.id,
      tieuDe: b.title ?? b.body.slice(0, 80),
      trangThai: trangThaiLich(b.status as TrangThaiBai, b.targets.map((t) => t.status as TrangThaiKenhBai)),
      trangThaiBai: b.status,
      luc,
      duKien: !b.scheduledAt,
      ngay: ngayVN(luc),
      gio: gioVN(luc),
      kenh: b.targets.map((t) => ({ id: t.connection.id, ten: t.connection.name, nenTang: t.connection.platform, tenNenTang: TEN_NEN_TANG[t.connection.platform] ?? t.connection.platform, trangThai: t.status })),
      chienDich: b.campaign ? { id: b.campaign.id, ten: b.campaign.name } : null,
      nguoiSoanId: b.createdBy,
      nguoiSoan: ten.get(b.createdBy) ?? "—",
      doAiTao: b.createdByType === "ai",
      canHenLai: b.status === "APPROVED" && b.needsReschedule,
      duyetLaiKenhLoi: b.reviewScope === "kenh-loi",
      keoDuoc: duocDoiLich(nc, b),
    };
  });
  return { khung: { ...k, tu: k.tu.toISOString(), den: k.den.toISOString() }, muc, gioiHan: ds.length >= 1000 };
}

/** Danh sách lọc cho màn hình lịch: kênh, chiến dịch, người soạn (trong phạm vi xem). */
export async function boLocLich(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const kenh = await nc.tx.socialConnection.findMany({ where: { disconnectedAt: null }, select: { id: true, name: true, platform: true }, orderBy: { name: "asc" } });
  const chienDich = await nc.tx.socialCampaign.findMany({ where: { status: "hoat-dong" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const tacGia = await nc.tx.socialPost.findMany({ where: { AND: [{ deletedAt: null }, await dieuKienXemBai(nc)] }, distinct: ["createdBy"], select: { createdBy: true }, take: 200 });
  const nguoi = await nc.tx.user.findMany({ where: { id: { in: tacGia.map((x) => x.createdBy) } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
  return {
    kenh: kenh.map((k) => ({ id: k.id, ten: k.name, tenNenTang: TEN_NEN_TANG[k.platform] ?? k.platform })),
    chienDich: chienDich.map((c) => ({ id: c.id, ten: c.name })),
    nguoiSoan: nguoi.map((u) => ({ id: u.id, ten: u.fullName })),
  };
}

/**
 * Đổi lịch một bài (kéo-thả trên lịch / sửa giờ). Trả chi tiết bài sau khi đổi.
 *  - SCHEDULED (mxh.update): mọi kênh chưa bắt đầu đăng → dời giờ hẹn của bài và các kênh đang chờ; kiểm hạn mức.
 *  - PENDING_APPROVAL: gửi duyệt kèm "đăng vào giờ hẹn" → đổi giờ hẹn (ghi lịch sử duyệt "đổi giờ" để người duyệt thấy);
 *    còn lại đổi ngày dự kiến.
 *  - DRAFT / APPROVED / CANCELED: đổi ngày dự kiến (không xếp lịch đăng — dùng Hẹn giờ ở trang bài).
 */
export async function doiLich(nc: NguCanh, id: string, d: z.infer<typeof LuocDoDoiLich>, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  // Khóa kênh-bài trước bài — cùng thứ tự worker (QĐ-209): worker đang nhận việc lúc đúng giờ thì chờ nó commit.
  await nc.tx.$queryRaw`SELECT id FROM social_post_targets WHERE post_id = ${id}::uuid ORDER BY id FOR UPDATE`;
  const b = await layBai(nc, id, true);
  const dl = doiLichDuoc(b.status as TrangThaiBai);
  if (!dl.duoc) throw new LoiNghiepVu(dl.lyDo!, 409, "khong-doi-lich");
  if (!duocDoiLich(nc, b)) throw new LoiThieuQuyen(b.status === "SCHEDULED" ? "mxh.update" : "mxh.create", { objectType: "social_post", objectId: id });
  const mocCu = mocLichCuaBai(b);
  const lucMoi = d.luc ? new Date(d.luc) : ghepNgayGio(d.ngay!, mocCu, d.gio);
  if (!lucMoi || Number.isNaN(lucMoi.getTime())) throw new LoiNghiepVu("Ngày giờ mới không hợp lệ.", 400, "sai-gio");
  const luc = docHenLuc(lucMoi.toISOString(), bayGio);
  let kieuDoi: "hen-gio" | "du-kien";

  if (b.status === "SCHEDULED") {
    if (b.targets.some((t) => !["QUEUED", "PENDING", "CANCELED"].includes(t.status))) {
      throw new LoiNghiepVu("Đã tới giờ, bài đang được đăng — không đổi lịch được.", 409, "dang-dang");
    }
    await kiemHanMucYoutube(nc.tx, b, luc);
    await kiemHanMucReels(nc, b, new Map(), luc);
    await nc.tx.socialPostTarget.updateMany({ where: { postId: id, status: "QUEUED" }, data: { nextAttemptAt: luc } });
    await nc.tx.socialPost.update({ where: { id }, data: { scheduledAt: luc, updatedBy: nc.hoSo.userId } });
    kieuDoi = "hen-gio";
  } else if (b.status === "PENDING_APPROVAL" && b.publishMode === "hen-gio") {
    await kiemHanMucYoutube(nc.tx, b, luc);
    await nc.tx.socialPost.update({ where: { id }, data: { scheduledAt: luc, updatedBy: nc.hoSo.userId } });
    await nc.tx.socialPostReview.create({ data: { tenantId: nc.tenantId, postId: id, action: "doi-gio", actorId: nc.hoSo.userId, note: `Đổi giờ hẹn → ${luc.toISOString()}` } });
    kieuDoi = "hen-gio";
  } else {
    await nc.tx.socialPost.update({ where: { id }, data: { plannedAt: luc, updatedBy: nc.hoSo.userId } });
    kieuDoi = "du-kien";
  }
  await nc.kiemToan({ action: "doi-lich-bai-mxh", objectType: "social_post", objectId: id, before: { luc: mocCu?.toISOString() ?? null, trangThai: b.status }, after: { luc: luc.toISOString(), kieu: kieuDoi } });
  if (kieuDoi === "hen-gio") await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_SCHEDULED, objectType: "social_post", objectId: id, payload: { cheDo: "doi-lich", henLuc: luc.toISOString() } });
  return chiTietBai(nc, id);
}
