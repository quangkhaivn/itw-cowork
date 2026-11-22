import { NextRequest } from "next/server";
import { voiTenant } from "@/lib/db";
import { ghiKiemToan } from "@/lib/kiem-toan";
import { layIpKhach } from "@/lib/yeu-cau";
import { docMediaCongKhai, kiemMaMedia } from "@/modules/mang-xa-hoi/media-ky";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function loi(status: number, cau: string) {
  return new Response(cau, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Phát ảnh của bài mạng xã hội qua link ký, ngắn hạn (QĐ-198). Không phiên; mã ký mang doanh nghiệp + bài + tệp + hạn.
 * Trả đúng byte, Content-Type đã nhận dạng lúc tải lên, KHÔNG chuyển hướng. Mỗi lần phát ghi kiểm toán.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ ma: string }> }) {
  const { ma } = await ctx.params;
  const kq = kiemMaMedia(ma, new Date());
  if (!kq.ok) return kq.ly === "het-han" ? loi(410, "Link đã hết hạn.") : loi(403, "Link không hợp lệ.");
  const ip = layIpKhach(req.headers);
  try {
    const tep = await voiTenant(kq.noiDung.tenantId, async (tx) => {
      const t = await docMediaCongKhai(tx, kq.noiDung);
      if (t) {
        await ghiKiemToan(tx, { action: "phat-media-mxh", objectType: "attachment", objectId: kq.noiDung.attachmentId, after: { baiId: kq.noiDung.postId, hetHan: new Date(kq.noiDung.hetHanGiay * 1000).toISOString() }, ipAddress: ip, userAgent: req.headers.get("user-agent") });
      }
      return t;
    });
    if (!tep) return loi(404, "Không tìm thấy.");
    const conLai = Math.max(0, kq.noiDung.hetHanGiay - Math.floor(Date.now() / 1000));
    return new Response(new Uint8Array(tep.noiDung), {
      status: 200,
      headers: {
        "Content-Type": tep.mime,
        "Content-Length": String(tep.noiDung.length),
        "Cache-Control": `public, max-age=${Math.min(conLai, 3600)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    console.error("[mxh-media] lỗi phát ảnh:", e instanceof Error ? e.message : e);
    return loi(404, "Không tìm thấy.");
  }
}
