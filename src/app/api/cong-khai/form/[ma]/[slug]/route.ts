import { NextRequest, NextResponse } from "next/server";
import { anhXaLoi } from "@/lib/api";
import { layIpKhach } from "@/lib/yeu-cau";
import { chayNhanCongKhai, LoiQuaToc } from "@/modules/marketing/cong-khai";
import { guiFormCongKhai } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

/** Trần kích thước thân yêu cầu — form có 8 trường, 20 KB là quá đủ. */
const TOI_DA_BYTE = 20_000;

/**
 * POST /api/cong-khai/form/<mã doanh nghiệp>/<slug> — nhận đăng ký từ trang /f hoặc /lp (MK-11).
 * Không cần phiên. `proxy.ts` vẫn kiểm Origin: chỉ trang của chính hệ thống gửi được.
 * Trả câu trả lời tối giản — không lộ mã lead, người được giao hay lead cũ có tồn tại không.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ ma: string; slug: string }> }) {
  const { ma, slug } = await ctx.params;
  const ip = layIpKhach(req.headers);
  try {
    // Trần tính theo BYTE: kiểm Content-Length trước khi đọc (khỏi kéo cả thân lớn vào bộ nhớ),
    // rồi kiểm lại số byte thật sau khi đọc (Content-Length có thể thiếu hoặc khai sai).
    const khai = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(khai) && khai > TOI_DA_BYTE) return NextResponse.json({ thongBao: "Dữ liệu gửi quá lớn." }, { status: 413 });
    const tho = await req.text();
    if (Buffer.byteLength(tho, "utf8") > TOI_DA_BYTE) return NextResponse.json({ thongBao: "Dữ liệu gửi quá lớn." }, { status: 413 });
    let than: Record<string, unknown>;
    try {
      const p = JSON.parse(tho);
      if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error();
      than = p as Record<string, unknown>;
    } catch {
      return NextResponse.json({ thongBao: "Dữ liệu gửi không hợp lệ." }, { status: 400 });
    }
    const bienThe = than.bienThe === "B" ? "B" : than.bienThe === "A" ? "A" : null;
    const kq = await chayNhanCongKhai(ma, "form", ip, (tx, tenantId) =>
      guiFormCongKhai(tx, tenantId, slug.slice(0, 60), than, {
        ip,
        userAgent: req.headers.get("user-agent"),
        landingPageId: typeof than.landingId === "string" ? than.landingId : null,
        landingVariant: bienThe,
      }),
    );
    return NextResponse.json({ ok: true, thongBao: kq.loiCamOn });
  } catch (loi) {
    const r = anhXaLoi(loi);
    if (loi instanceof LoiQuaToc) r.headers.set("Retry-After", String(loi.conLaiGiay));
    return r;
  }
}
