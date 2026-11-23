import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import type { LuocDoThuongHieu } from "./luoc-do";
import { chuanHoaHoSo, HO_SO_TRONG, type HoSoThuongHieu } from "./thuong-hieu-thuan";

/**
 * Hồ sơ thương hiệu (0.25.0, QĐ-235): giọng văn, từ cấm, hashtag bắt buộc, câu bắt buộc, câu kêu gọi hành động (CTA), bài
 * mẫu. Một hồ sơ / doanh nghiệp (bảng `brand_profiles` có từ 0.23.0). Xem: `mxh.view`. Sửa: người DUYỆT bài
 * (`mxh.approve` — Trưởng phòng Marketing, Giám đốc, Quản trị) hoặc `setting.update`.
 */

function tuDong(d: { voice: string | null; bannedWords: string[]; defaultHashtags: string[]; mandatoryPhrases: string[]; ctaTemplates: unknown; samplePosts: string[] } | null): HoSoThuongHieu {
  if (!d) return HO_SO_TRONG;
  return chuanHoaHoSo({
    giongVan: d.voice, tuCam: d.bannedWords, hashtagBatBuoc: d.defaultHashtags, cauBatBuoc: d.mandatoryPhrases,
    cta: Array.isArray(d.ctaTemplates) ? d.ctaTemplates : [], baiMau: d.samplePosts,
  });
}

/** Đọc hồ sơ trong ngữ cảnh doanh nghiệp (không kiểm quyền — dùng nội bộ cho cảnh báo / lời nhắc AI). */
export async function docHoSoThuongHieu(tx: ClientTenant): Promise<HoSoThuongHieu> {
  const d = await tx.brandProfile.findFirst({ select: { voice: true, bannedWords: true, defaultHashtags: true, mandatoryPhrases: true, ctaTemplates: true, samplePosts: true } });
  return tuDong(d);
}

function suaDuoc(nc: NguCanh): boolean {
  return coQuyen(nc.hoSo, "mxh.approve") || coQuyen(nc.hoSo, "setting.update");
}

export async function xemHoSoThuongHieu(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const d = await nc.tx.brandProfile.findFirst({ select: { voice: true, bannedWords: true, defaultHashtags: true, mandatoryPhrases: true, ctaTemplates: true, samplePosts: true, updatedAt: true, updatedBy: true } });
  const nguoi = d?.updatedBy ? await nc.tx.user.findFirst({ where: { id: d.updatedBy }, select: { fullName: true } }) : null;
  return { ...tuDong(d), suaLuc: d?.updatedAt ?? null, suaBoi: nguoi?.fullName ?? null, suaDuoc: suaDuoc(nc) };
}

export async function luuHoSoThuongHieu(nc: NguCanh, nhap: z.infer<typeof LuocDoThuongHieu>) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  if (!suaDuoc(nc)) throw new LoiThieuQuyen("mxh.approve", { objectType: "brand_profile" });
  const hs = chuanHoaHoSo(nhap);
  const truoc = await docHoSoThuongHieu(nc.tx);
  const data = {
    voice: hs.giongVan, bannedWords: hs.tuCam, defaultHashtags: hs.hashtagBatBuoc, mandatoryPhrases: hs.cauBatBuoc,
    ctaTemplates: hs.cta, samplePosts: hs.baiMau, updatedBy: nc.hoSo.userId,
  };
  const co = await nc.tx.brandProfile.findFirst({ select: { id: true } });
  if (co) await nc.tx.brandProfile.update({ where: { id: co.id }, data });
  else await nc.tx.brandProfile.create({ data: { tenantId: nc.tenantId, ...data } });
  // Kiểm toán ghi số lượng, không chép nguyên bài mẫu.
  const tom = (h: HoSoThuongHieu) => ({ coGiongVan: Boolean(h.giongVan), tuCam: h.tuCam.length, hashtag: h.hashtagBatBuoc.length, cauBatBuoc: h.cauBatBuoc.length, cta: h.cta.length, baiMau: h.baiMau.length });
  await nc.kiemToan({ action: "sua-ho-so-thuong-hieu", objectType: "brand_profile", before: tom(truoc), after: tom(hs) });
  return xemHoSoThuongHieu(nc);
}
