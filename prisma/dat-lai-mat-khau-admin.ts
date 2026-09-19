import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

/**
 * Đặt lại mật khẩu tài khoản quản trị khi bị khóa ngoài.
 *
 * Chạy bằng vai CHỦ SỞ HỮU (DATABASE_URL_OWNER) để bỏ qua RLS — giống seed.
 * KHÔNG in mật khẩu ra màn hình. Mật khẩu mới nhận qua biến môi trường MAT_KHAU_MOI
 * do người vận hành tự đặt trong phiên shell của mình.
 *
 * Hai chế độ:
 *   1) Liệt kê tài khoản (chẩn đoán "gõ sai email"):
 *        LIET_KE=1
 *   2) Đặt lại mật khẩu:
 *        ADMIN_EMAIL=<email>  MAT_KHAU_MOI=<mật khẩu mới, ≥10 ký tự>
 *
 * MA_TENANT mặc định "itw", đổi được qua biến môi trường.
 */

const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL_OWNER (hoặc DATABASE_URL).");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const MA_TENANT = process.env.MA_TENANT ?? "itw";

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { code: MA_TENANT },
    select: { id: true, code: true, name: true },
  });
  if (!tenant) throw new Error(`Không tìm thấy doanh nghiệp có mã "${MA_TENANT}".`);

  // ---- Chế độ 1: liệt kê tài khoản người thật (không phải tài khoản máy) ----
  if (process.env.LIET_KE) {
    const dsNguoiDung = await prisma.user.findMany({
      where: { tenantId: tenant.id, isSystem: false },
      select: {
        email: true,
        fullName: true,
        status: true,
        lastLoginAt: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`\n=== Tài khoản đăng nhập được — ${tenant.name} (mã: ${tenant.code}) ===\n`);
    for (const u of dsNguoiDung) {
      const vaiTro = u.userRoles.map((r) => r.role.code).join(", ") || "(chưa gán)";
      const lanCuoi = u.lastLoginAt ? u.lastLoginAt.toISOString() : "chưa từng";
      console.log(`  email: ${u.email}`);
      console.log(`    họ tên   : ${u.fullName}`);
      console.log(`    vai trò  : ${vaiTro}`);
      console.log(`    trạng thái: ${u.status}   đăng nhập lần cuối: ${lanCuoi}\n`);
    }
    console.log(`Tổng: ${dsNguoiDung.length} tài khoản. Đăng nhập với MÃ DOANH NGHIỆP: ${tenant.code}`);
    return;
  }

  // ---- Chế độ 2: đặt lại mật khẩu ----
  const email = process.env.ADMIN_EMAIL;
  const matKhauMoi = process.env.MAT_KHAU_MOI;
  if (!email || !matKhauMoi) {
    throw new Error(
      "Thiếu ADMIN_EMAIL hoặc MAT_KHAU_MOI.\n" +
        "  · Muốn xem danh sách tài khoản trước: đặt LIET_KE=1.\n" +
        "  · Muốn đổi mật khẩu: đặt ADMIN_EMAIL và MAT_KHAU_MOI.",
    );
  }
  if (matKhauMoi.length < 10) {
    throw new Error("MAT_KHAU_MOI phải dài từ 10 ký tự trở lên.");
  }

  const nguoiDung = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
    select: { id: true, email: true, fullName: true, isSystem: true, status: true },
  });

  if (!nguoiDung) {
    const cacEmail = await prisma.user.findMany({
      where: { tenantId: tenant.id, isSystem: false },
      select: { email: true },
    });
    throw new Error(
      `Không có tài khoản email "${email}" trong doanh nghiệp "${tenant.code}".\n` +
        `Email đang có: ${cacEmail.map((e) => e.email).join(", ") || "(không có)"}`,
    );
  }
  if (nguoiDung.isSystem) {
    throw new Error(
      `Tài khoản "${email}" là tài khoản máy (ví dụ trợ lý ITA) — không đăng nhập bằng form và không đặt lại ở đây.`,
    );
  }

  await prisma.user.update({
    where: { id: nguoiDung.id },
    data: { passwordHash: await bcrypt.hash(matKhauMoi, 12) },
  });

  console.log(`✓ Đã đặt lại mật khẩu cho: ${nguoiDung.email} (${nguoiDung.fullName})`);
  console.log(`  Đăng nhập tại /dang-nhap với mã doanh nghiệp: ${tenant.code}`);
  if (nguoiDung.status !== "hoat-dong") {
    console.log(`  ⚠ Lưu ý: trạng thái tài khoản đang "${nguoiDung.status}", route đăng nhập chỉ nhận "hoat-dong".`);
  }
}

main()
  .catch((loi) => {
    console.error("Đặt lại mật khẩu HỎNG:", loi instanceof Error ? loi.message : loi);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
