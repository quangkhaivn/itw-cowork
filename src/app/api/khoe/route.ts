import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { docTinhTrangVanHanh } from "@/modules/van-hanh/nhip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Kiểm tra sức khỏe: ứng dụng sống và nói chuyện được với cơ sở dữ liệu.
 *
 * 0.16.1: thêm `worker` = "ok" | "tre" (nhịp cuối quá 5 phút hoặc chưa từng có). Chỉ MỘT chữ —
 * trang này mở công khai; thời điểm nhịp, phiên bản, sao lưu chỉ có ở `/api/v1/tu-dong-hoa/van-hanh`
 * (cần `setting.view`). Worker trễ KHÔNG làm trang trả 503: ứng dụng vẫn phục vụ được, và
 * `trien-khai.sh` chờ trang này 200 trước khi worker kịp ghi nhịp đầu tiên.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (loi) {
    // Chi tiết lỗi chỉ vào log máy chủ. Trang này mở công khai, không được lộ cấu trúc bên trong.
    console.error("[khoe] không kết nối được cơ sở dữ liệu:", loi);
    return NextResponse.json({ ok: false, db: "khong-ket-noi-duoc" }, { status: 503 });
  }
  let worker: "ok" | "tre" = "tre";
  try {
    worker = (await docTinhTrangVanHanh(prisma)).worker.trangThai === "ok" ? "ok" : "tre";
  } catch (loi) {
    console.error("[khoe] không đọc được nhịp worker:", loi);
  }
  return NextResponse.json({ ok: true, db: "ket-noi-duoc", worker, luc: new Date().toISOString() });
}
