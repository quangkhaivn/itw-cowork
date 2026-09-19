import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timTenantTheoMa, voiTenant } from "@/lib/db";
import { bamMatKhau, datCookiePhien, kiemTraMatKhau, kyPhien } from "@/lib/xac-thuc";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { ghiKiemToan } from "@/lib/kiem-toan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LuocDo = z.object({
  maDoanhNghiep: z.string().min(1).max(50),
  email: z.string().email().max(255),
  matKhau: z.string().min(1).max(200),
});

/** Một câu trả lời duy nhất cho mọi kiểu sai, để không lộ email nào có thật. */
const THONG_BAO_SAI = "Mã doanh nghiệp, email hoặc mật khẩu không đúng.";

export async function POST(req: NextRequest) {
  const dauVao = LuocDo.safeParse(await req.json().catch(() => null));
  if (!dauVao.success) {
    return NextResponse.json({ thongBao: THONG_BAO_SAI }, { status: 400 });
  }
  const { maDoanhNghiep, email, matKhau } = dauVao.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent");

  const tenant = await timTenantTheoMa(maDoanhNghiep);
  if (!tenant) {
    // Vẫn tốn thời gian băm một lần để thời gian phản hồi không tiết lộ tenant có thật hay không.
    await bamMatKhau(matKhau);
    return NextResponse.json({ thongBao: THONG_BAO_SAI }, { status: 401 });
  }

  const ketQua = await voiTenant(tenant.id, async (tx) => {
    const nguoiDung = await tx.user.findFirst({
      where: { email, status: "hoat-dong" },
      select: { id: true, email: true, fullName: true, passwordHash: true, isSystem: true },
    });

    // Tài khoản máy (ví dụ trợ lý ITA) không được đăng nhập bằng form.
    if (!nguoiDung || nguoiDung.isSystem) {
      await bamMatKhau(matKhau);
      await ghiSuKien(tx, {
        eventType: SU_KIEN.USER_LOGIN_FAILED,
        actorType: "system",
        objectType: "user",
        payload: { email, lyDo: nguoiDung ? "tai-khoan-he-thong" : "khong-ton-tai" },
      });
      await ghiKiemToan(tx, {
        actorEmail: email,
        action: "dang-nhap-that-bai",
        objectType: "user",
        ipAddress: ip,
        userAgent,
      });
      return null;
    }

    const dung = await kiemTraMatKhau(matKhau, nguoiDung.passwordHash);
    if (!dung) {
      await ghiSuKien(tx, {
        eventType: SU_KIEN.USER_LOGIN_FAILED,
        actorType: "user",
        actorId: nguoiDung.id,
        objectType: "user",
        objectId: nguoiDung.id,
        payload: { email, lyDo: "sai-mat-khau" },
      });
      await ghiKiemToan(tx, {
        actorId: nguoiDung.id,
        actorEmail: email,
        action: "dang-nhap-that-bai",
        objectType: "user",
        objectId: nguoiDung.id,
        ipAddress: ip,
        userAgent,
      });
      return null;
    }

    await tx.user.update({
      where: { id: nguoiDung.id },
      data: { lastLoginAt: new Date() },
    });

    await ghiSuKien(tx, {
      eventType: SU_KIEN.USER_LOGGED_IN,
      actorType: "user",
      actorId: nguoiDung.id,
      objectType: "user",
      objectId: nguoiDung.id,
      payload: { email },
    });
    await ghiKiemToan(tx, {
      actorId: nguoiDung.id,
      actorEmail: email,
      action: "dang-nhap",
      objectType: "user",
      objectId: nguoiDung.id,
      ipAddress: ip,
      userAgent,
    });

    return { id: nguoiDung.id, email: nguoiDung.email, hoTen: nguoiDung.fullName };
  });

  if (!ketQua) {
    return NextResponse.json({ thongBao: THONG_BAO_SAI }, { status: 401 });
  }

  const token = await kyPhien({ userId: ketQua.id, tenantId: tenant.id, email: ketQua.email });
  await datCookiePhien(token);

  return NextResponse.json({ ok: true, hoTen: ketQua.hoTen, doanhNghiep: tenant.name });
}
