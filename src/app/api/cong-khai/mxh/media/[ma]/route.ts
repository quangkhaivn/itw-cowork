import { NextRequest } from "next/server";
import { voiTenant } from "@/lib/db";
import { ghiKiemToan } from "@/lib/kiem-toan";
import { layIpKhach } from "@/lib/yeu-cau";
import { docMediaCongKhai, kiemMaMedia } from "@/modules/mang-xa-hoi/media-ky";
import { doiSangJpeg } from "@/modules/mang-xa-hoi/media/doi-jpeg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Một khúc `Range: bytes=a-b` / `a-` / `-n`. Không có / nhiều khúc / khác bytes → null (trả cả tệp, RFC 9110 cho phép). */
function docRange(h: string | null, tong: number): [number, number] | null | "sai" {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let tu: number;
  let den: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0) return "sai";
    tu = Math.max(0, tong - n);
    den = tong - 1;
  } else {
    tu = Number(m[1]);
    den = m[2] === "" ? tong - 1 : Math.min(Number(m[2]), tong - 1);
  }
  if (!Number.isSafeInteger(tu) || !Number.isSafeInteger(den) || tu >= tong || den < tu) return "sai";
  return [tu, den];
}

function loi(status: number, cau: string) {
  return new Response(cau, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Phát ảnh của bài mạng xã hội qua link ký, ngắn hạn (QĐ-198). Không phiên; mã ký mang doanh nghiệp + bài + tệp + hạn.
 * Trả đúng byte, Content-Type đã nhận dạng lúc tải lên, KHÔNG chuyển hướng. Mỗi lần phát ghi kiểm toán.
 * 0.24.0: mã ký có cờ `jpeg` (Instagram chỉ nhận JPEG) → đổi ảnh sang JPEG ngay lúc phát (sharp); video phát nguyên byte.
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
    if (kq.noiDung.jpeg && tep.mime !== "image/jpeg") {
      if (!tep.mime.startsWith("image/")) return loi(404, "Không tìm thấy.");
      const j = await doiSangJpeg(tep.noiDung);
      if (!j) return loi(415, "Máy chủ không đổi được ảnh sang JPEG.");
      tep.noiDung = j;
      tep.mime = "image/jpeg";
    }
    const conLai = Math.max(0, kq.noiDung.hetHanGiay - Math.floor(Date.now() / 1000));
    const tieuDe: Record<string, string> = {
      "Content-Type": tep.mime,
      "Cache-Control": `public, max-age=${Math.min(conLai, 3600)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
    };
    // QA 0.24.0 (QĐ-226): máy kéo video của nền tảng có thể hỏi từng khúc (Range) — trả 206 đúng khúc, khúc sai → 416.
    // Không chép thêm một bản 200 MB trong bộ nhớ (dùng thẳng vùng nhớ của Buffer).
    const tong = tep.noiDung.length;
    const kh = docRange(req.headers.get("range"), tong);
    if (kh === "sai") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${tong}`, "Cache-Control": "no-store" } });
    const [tu, den] = kh ?? [0, tong - 1];
    const than = tep.noiDung.subarray(tu, den + 1);
    return new Response(new Uint8Array(than.buffer, than.byteOffset, than.length), {
      status: kh ? 206 : 200,
      headers: { ...tieuDe, "Content-Length": String(than.length), ...(kh ? { "Content-Range": `bytes ${tu}-${den}/${tong}` } : {}) },
    });
  } catch (e) {
    console.error("[mxh-media] lỗi phát ảnh:", e instanceof Error ? e.message : e);
    return loi(404, "Không tìm thấy.");
  }
}
