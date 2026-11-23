import { z } from "zod";
import { docThan, xuLyApi } from "@/lib/api";
import { taoLinkMedia } from "@/modules/mang-xa-hoi/media-ky";

/** Link công khai có ký, hết hạn theo Cấu hình (để nền tảng kéo ảnh). Chỉ người có mxh.update (QĐ-205). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, z.object({ attachmentId: z.uuid() }));
  return taoLinkMedia(nc, id, d.attachmentId);
}, { quyen: "mxh.update" });
