import { NextRequest } from "next/server";
import { layIpKhach } from "@/lib/yeu-cau";
import { ghiMo } from "@/modules/email/cong-khai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ảnh GIF 1×1 trong suốt. */
const ANH = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Điểm ảnh đếm lượt mở (EM-11). Luôn trả ảnh — mã hỏng cũng vậy, không lộ gì. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ ma: string }> }) {
  const { ma } = await ctx.params;
  await ghiMo(ma, { ip: layIpKhach(req.headers), userAgent: req.headers.get("user-agent") }).catch((e) => console.error("[email-mo] lỗi:", e));
  return new Response(new Uint8Array(ANH), {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0", "Content-Length": String(ANH.length) },
  });
}
