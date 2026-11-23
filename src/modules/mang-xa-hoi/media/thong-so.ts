import { docTep } from "@/modules/dinh-kem/kho-tep";
import type { MediaKiem } from "../luat-nen-tang";
import { docThongSoAnh, docThongSoVideo } from "./doc-media";

/**
 * Đọc thông số media của bài từ tệp đính kèm trên đĩa (máy chủ) — để kiểm luật nền tảng trước khi xếp hàng (QĐ-212).
 */
export interface DongMediaBai {
  attachment: { id: string; fileName: string; mimeType: string; sizeBytes: number | bigint; storedPath: string };
}

export async function docThongSoMediaBai(ds: DongMediaBai[]): Promise<MediaKiem[]> {
  const kq: MediaKiem[] = [];
  for (const m of ds) {
    const a = m.attachment;
    const base = { attachmentId: a.id, tenTep: a.fileName, mime: a.mimeType, dungLuong: Number(a.sizeBytes), rong: null, cao: null, thoiLuongGiay: null } as MediaKiem;
    try {
      const b = await docTep(a.storedPath);
      if (a.mimeType.startsWith("image/")) Object.assign(base, docThongSoAnh(a.mimeType, b));
      else if (a.mimeType.startsWith("video/")) Object.assign(base, docThongSoVideo(b));
    } catch {
      /* tệp mất trên đĩa → thông số null → luật báo "không đọc được" */
    }
    kq.push(base);
  }
  return kq;
}

export function appUrlHttps(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^https:\/\/[^/]+/.test((env.APP_URL ?? "").trim());
}
