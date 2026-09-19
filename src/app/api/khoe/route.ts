import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Kiểm tra sức khỏe: ứng dụng sống và nói chuyện được với cơ sở dữ liệu. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "ket-noi-duoc", luc: new Date().toISOString() });
  } catch (loi) {
    // Chi tiết lỗi chỉ vào log máy chủ. Trang này mở công khai, không được lộ cấu trúc bên trong.
    console.error("[khoe] không kết nối được cơ sở dữ liệu:", loi);
    return NextResponse.json({ ok: false, db: "khong-ket-noi-duoc" }, { status: 503 });
  }
}
