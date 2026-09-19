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
    return NextResponse.json(
      { ok: false, db: "khong-ket-noi-duoc", chiTiet: String(loi) },
      { status: 503 },
    );
  }
}
