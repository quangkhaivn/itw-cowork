import { NextRequest, NextResponse } from "next/server";
import { demVaKiem } from "@/lib/gioi-han-toc-do";
import { layIpKhach } from "@/lib/yeu-cau";
import { nhanYeuCauXoaDuLieu } from "@/modules/mang-xa-hoi/trang-cong-khai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Data Deletion Request Callback của Meta (0.24.0, QĐ-207). Meta POST `signed_request` (form). Không phiên, không Origin.
 * Kiểm khuôn + giới hạn tốc độ theo IP → ghi yêu cầu → trả `{ url, confirmation_code }`. Chữ ký kiểm ở worker (App Secret
 * chỉ worker mở được); sai chữ ký → không xóa gì, trang trạng thái ghi rõ.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ dn: string }> }) {
  const { dn } = await ctx.params;
  const ip = layIpKhach(req.headers);
  const gh = await demVaKiem(`cong-khai:mxh-xoa:${ip ?? "khong-ro"}`, 30, 15 * 60);
  if (!gh.choPhep) return NextResponse.json({ error: "Quá nhiều yêu cầu." }, { status: 429 });
  let sr = "";
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) sr = String(((await req.json()) as { signed_request?: unknown }).signed_request ?? "");
    else sr = String(new URLSearchParams(await req.text()).get("signed_request") ?? "");
  } catch {
    sr = "";
  }
  const kq = await nhanYeuCauXoaDuLieu(dn, sr, ip);
  if (!kq.ok) return NextResponse.json({ error: kq.thongBao }, { status: kq.status });
  return NextResponse.json({ url: kq.url, confirmation_code: kq.confirmation_code });
}
