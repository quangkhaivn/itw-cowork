import { NextRequest, NextResponse } from "next/server";
import { demVaKiem } from "@/lib/gioi-han-toc-do";
import { layIpKhach } from "@/lib/yeu-cau";
import { nhanThongDiepSes } from "@/modules/email/su-kien-ses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Thông điệp SNS tối đa 256 KB; thêm phần bao — trần 300 KB tính theo byte. */
const TOI_DA_BYTE = 300_000;
/** Trần kỹ thuật chống dồn dập — SNS gửi theo lô nhỏ, đỉnh vài chục / giây khi chiến dịch lớn. */
const GIOI_HAN = { toiDa: 1200, cuaSoGiay: 60 };

/** Thân yêu cầu dạng chuỗi UTF-8, tối đa `toiDa` byte; vượt → null (đã hủy luồng đọc). */
async function docThanGioiHan(req: NextRequest, toiDa: number): Promise<string | null> {
  if (!req.body) return "";
  const doc = req.body.getReader();
  const phan: Uint8Array[] = [];
  let tong = 0;
  for (;;) {
    const { done, value } = await doc.read();
    if (done) break;
    tong += value.byteLength;
    if (tong > toiDa) {
      await doc.cancel().catch(() => {});
      return null;
    }
    phan.push(value);
  }
  return Buffer.concat(phan).toString("utf8");
}

/**
 * POST /api/cong-khai/email/ses/<mã> — SNS đẩy sự kiện SES (EG-02 → EG-04). Không phiên, không Origin
 * (proxy miễn kiểm cho /api/cong-khai/email/); xác thực = mã trong đường dẫn + chữ ký SNS.
 * Dữ liệu sai → 400; sai mã / chữ ký / chủ đề / host chứng chỉ → 403; quá lớn → 413; dồn dập → 429.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ ma: string }> }) {
  const ip = layIpKhach(req.headers);
  const { ma } = await ctx.params;
  try {
    const gh = await demVaKiem(`cong-khai:ses:${ip ?? "khong-ro"}`, GIOI_HAN.toiDa, GIOI_HAN.cuaSoGiay);
    if (!gh.choPhep) return NextResponse.json({ thongBao: "Thử lại sau." }, { status: 429, headers: { "Retry-After": String(gh.conLaiGiay) } });
    const khai = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(khai) && khai > TOI_DA_BYTE) return NextResponse.json({ thongBao: "Dữ liệu gửi quá lớn." }, { status: 413 });
    // Đọc từng phần và dừng ngay khi vượt trần: thân gửi kiểu chunked (không Content-Length) không được
    // nạp hết vào bộ nhớ trước khi kiểm (QA 0.18.0: req.text() đã đọc trọn 50 MB rồi mới trả 413).
    const tho = await docThanGioiHan(req, TOI_DA_BYTE);
    if (tho === null) return NextResponse.json({ thongBao: "Dữ liệu gửi quá lớn." }, { status: 413 });
    const kq = await nhanThongDiepSes(ma.slice(0, 100), tho, { loaiTieuDe: req.headers.get("x-amz-sns-message-type") });
    return NextResponse.json(kq.than, { status: kq.status });
  } catch (e) {
    // Lỗi hạ tầng (CSDL…): 503 để SNS gửi lại — không bao giờ 500.
    console.error("[ses-webhook] lỗi:", e);
    return NextResponse.json({ thongBao: "Tạm thời không xử lý được — thử lại sau." }, { status: 503 });
  }
}
