import { NextRequest } from "next/server";
import { layIpKhach } from "@/lib/yeu-cau";
import { ADMS_THAN_TOI_DA_BYTE, xuLyAdms } from "@/modules/cham-cong/may-cham-cong";

export const dynamic = "force-dynamic";

/**
 * Cổng cho MÁY CHẤM CÔNG VÂN TAY (ZKTeco ADMS / PUSH) — `/iclock/cdata`, `/iclock/getrequest`,
 * `/iclock/devicecmd` (chấp nhận cả đuôi `.aspx`). Không có phiên đăng nhập: máy được nhận ra bằng
 * số sê-ri đã đăng ký (NS-14). Trả văn bản thuần theo giao thức PUSH.
 *
 * Nhiều đời máy chỉ nói HTTP (không HTTPS): nginx máy chủ mở HTTP CHỈ cho tiền tố `/iclock/`
 * (DEPLOYMENT.md, mục "Máy chấm công vân tay"); mọi đường khác vẫn chuyển sang HTTPS.
 * `proxy.ts` cho `/iclock` đi qua không cần phiên; tiền tố này không phải `/api` nên không kiểm Origin.
 */

function vanBan(status: number, than: string): Response {
  return new Response(than, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

async function xuLy(req: NextRequest, ctx: { params: Promise<{ duong: string[] }> }): Promise<Response> {
  const { duong } = await ctx.params;
  if (!Array.isArray(duong) || duong.length !== 1) return vanBan(404, "Not Found");
  try {
    let than: string | null = null;
    if (req.method === "POST") {
      // Trần theo BYTE: kiểm Content-Length trước, rồi kiểm lại sau khi đọc (có thể thiếu / khai sai).
      const khai = Number(req.headers.get("content-length") ?? "0");
      if (Number.isFinite(khai) && khai > ADMS_THAN_TOI_DA_BYTE) return vanBan(413, "ERROR: TOO LARGE");
      const buf = Buffer.from(await req.arrayBuffer());
      if (buf.byteLength > ADMS_THAN_TOI_DA_BYTE) return vanBan(413, "ERROR: TOO LARGE");
      than = buf.toString("utf8");
    }
    const kq = await xuLyAdms({
      phuongThuc: req.method,
      doan: duong[0],
      truyVan: req.nextUrl.searchParams,
      than,
      ip: layIpKhach(req.headers),
    });
    return vanBan(kq.status, kq.than);
  } catch (loi) {
    console.error("[iclock] lỗi xử lý yêu cầu của máy chấm công:", loi);
    // Máy sẽ tự gửi lại sau ErrorDelay giây — không trả chi tiết lỗi.
    return vanBan(500, "ERROR");
  }
}

export const GET = xuLy;
export const POST = xuLy;
