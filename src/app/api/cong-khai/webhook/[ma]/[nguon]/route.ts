import { NextRequest, NextResponse } from "next/server";
import { anhXaLoi } from "@/lib/api";
import { layIpKhach } from "@/lib/yeu-cau";
import { chayNhanCongKhai, LoiQuaToc } from "@/modules/marketing/cong-khai";
import { nhanQuaWebhook } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

const TOI_DA_BYTE = 50_000;

/**
 * POST /api/cong-khai/webhook/<mã doanh nghiệp>/<mã nguồn> — nhận lead từ hệ thống khác (MK-12).
 * Khóa bí mật gửi trong tiêu đề `X-Cowork-Key` (hoặc `Authorization: Bearer …`), KHÔNG trên URL —
 * URL hay bị ghi vào nhật ký truy cập của proxy dọc đường.
 * Mọi lần nhận, kể cả bị từ chối, đều vào nhật ký `lead_captures` của nguồn đó.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ ma: string; nguon: string }> }) {
  const { ma, nguon } = await ctx.params;
  const ip = layIpKhach(req.headers);
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
  const khoa = req.headers.get("x-cowork-key") ?? bearer;
  try {
    // Trần tính theo BYTE: kiểm Content-Length trước khi đọc (khỏi kéo cả thân lớn vào bộ nhớ),
    // rồi kiểm lại số byte thật sau khi đọc (Content-Length có thể thiếu hoặc khai sai).
    const khai = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(khai) && khai > TOI_DA_BYTE) return NextResponse.json({ thongBao: "Dữ liệu gửi quá lớn." }, { status: 413 });
    const tho = await req.text();
    if (Buffer.byteLength(tho, "utf8") > TOI_DA_BYTE) return NextResponse.json({ thongBao: "Dữ liệu gửi quá lớn." }, { status: 413 });
    let than: unknown = null;
    try {
      than = JSON.parse(tho);
    } catch {
      than = null;
    }
    const kq = await chayNhanCongKhai(ma, "webhook", ip, (tx, tenantId) =>
      nhanQuaWebhook(tx, tenantId, nguon.slice(0, 60), khoa, than, { ip, userAgent: req.headers.get("user-agent") }),
    );
    return NextResponse.json({ ok: true, ketQua: kq.ketQua === "tao-moi" ? "da-nhan" : "da-ghi-them" });
  } catch (loi) {
    const r = anhXaLoi(loi);
    if (loi instanceof LoiQuaToc) r.headers.set("Retry-After", String(loi.conLaiGiay));
    return r;
  }
}
