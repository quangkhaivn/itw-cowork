import { NextResponse } from "next/server";
import { voiTenant } from "@/lib/db";
import { layPhienHienTai, xoaCookiePhien } from "@/lib/xac-thuc";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { ghiKiemToan } from "@/lib/kiem-toan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const phien = await layPhienHienTai();

  if (phien) {
    await voiTenant(phien.tenantId, async (tx) => {
      await ghiSuKien(tx, {
        eventType: SU_KIEN.USER_LOGGED_OUT,
        actorType: "user",
        actorId: phien.userId,
        objectType: "user",
        objectId: phien.userId,
      });
      await ghiKiemToan(tx, {
        actorId: phien.userId,
        actorEmail: phien.email,
        action: "dang-xuat",
        objectType: "user",
        objectId: phien.userId,
      });
    });
  }

  await xoaCookiePhien();
  return NextResponse.json({ ok: true });
}
