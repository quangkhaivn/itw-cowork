import { z } from "zod";
import { docThan, xuLyApi } from "@/lib/api";
import { doiTrangThaiMau } from "@/modules/email/service";

export const dynamic = "force-dynamic";

/** Lưu trữ hoặc dùng lại mẫu. Không có đường xóa mẫu. */
export const POST = xuLyApi<{ id: string }>(
  async (nc, req, { id }) => doiTrangThaiMau(nc, id, (await docThan(req, z.object({ luuTru: z.boolean() }))).luuTru),
  { quyen: "marketing.update" },
);
