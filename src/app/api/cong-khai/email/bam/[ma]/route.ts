import { NextRequest, NextResponse } from "next/server";
import { layIpKhach } from "@/lib/yeu-cau";
import { ghiBam } from "@/modules/email/cong-khai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Chuyển hướng liên kết trong thư (EM-11). Đích lấy **từ nội dung chiến dịch** theo chỉ số
 * nằm trong mã ký — không có tham số URL nào trên đường dẫn, nên không thành open redirect.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ ma: string }> }) {
  const { ma } = await ctx.params;
  const url = await ghiBam(ma, { ip: layIpKhach(req.headers), userAgent: req.headers.get("user-agent") }).catch((e) => {
    console.error("[email-bam] lỗi:", e);
    return null;
  });
  if (!url) return new NextResponse("Liên kết không hợp lệ hoặc đã hết hiệu lực.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return NextResponse.redirect(url, 302);
}
