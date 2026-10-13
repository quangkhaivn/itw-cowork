import { NextRequest, NextResponse } from "next/server";
import { demVaKiem } from "@/lib/gioi-han-toc-do";
import { layIpKhach } from "@/lib/yeu-cau";
import { huyNhanTin } from "@/modules/email/cong-khai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Huỷ nhận tin một chạm (EM-10): đích của nút trên trang `/huy-nhan-tin/...` **và** của
 * `List-Unsubscribe-Post` (RFC 8058) — ứng dụng thư (Gmail, Outlook) POST thẳng vào đây, không có
 * cookie, không có Origin. Vì vậy tiền tố `/api/cong-khai/` được miễn kiểm nguồn gốc ở proxy:
 * xác thực ở đây là **mã ký** trong đường dẫn, không phải phiên.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ ma: string }> }) {
  const ip = layIpKhach(req.headers);
  const gh = await demVaKiem(`cong-khai:huy:${ip ?? "khong-ro"}`, 60, 15 * 60);
  if (!gh.choPhep) return NextResponse.json({ thongBao: "Thử lại sau ít phút." }, { status: 429 });
  const { ma } = await ctx.params;
  const ok = await huyNhanTin(ma, { ip, userAgent: req.headers.get("user-agent") }).catch((e) => {
    console.error("[huy-nhan-tin] lỗi:", e);
    return false;
  });
  if (!ok) return NextResponse.json({ thongBao: "Liên kết huỷ nhận tin không hợp lệ hoặc đã hết hiệu lực." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
