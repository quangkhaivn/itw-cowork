import { NextResponse } from "next/server";
import { xuLyApi } from "@/lib/api";
import { phienBanUngDung } from "@/lib/phien-ban";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Máy chủ này đang chạy bản nào.
 *
 * Cố ý **có đăng nhập**, khác `/api/khoe` mở công khai: phiên bản không phải bí mật
 * nhưng cũng không có lý do gì để người ngoài biết. Ai đăng nhập được cũng xem được —
 * không cần quyền riêng, vì đây là câu hỏi về máy chứ không phải về dữ liệu.
 */
export const GET = xuLyApi(async () => phienBanUngDung(), { choPhepKhiPhaiDoiMatKhau: true });

/** Chặn mọi phương thức ghi cho rõ ràng. */
export async function POST() {
  return NextResponse.json({ thongBao: "Chỉ đọc." }, { status: 405 });
}
