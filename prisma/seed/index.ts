import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { VAI_TRO, toanBoQuyen, kiemTraGioiHanAI } from "../../src/lib/vai-tro";

/**
 * Seed nền móng Phase 1.
 *
 * Chạy bằng vai CHỦ SỞ HỮU (DATABASE_URL_OWNER) để không bị RLS chặn.
 * Idempotent: chạy lại nhiều lần không sinh dữ liệu trùng.
 *
 * KHÔNG tạo dữ liệu nghiệp vụ giả (khách hàng, đơn hàng, doanh thu). Mục 30 đặc tả
 * cấm bịa số liệu. Seed dữ liệu mẫu nghiệp vụ là việc của Phase 2 và phải lấy từ
 * dữ liệu thật của ITW hoặc do Giám đốc cung cấp.
 */

const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL_OWNER (hoặc DATABASE_URL).");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const MA_TENANT = "itw";

const PHONG_BAN = [
  { code: "ban-giam-doc", name: "Ban Giám đốc" },
  { code: "kinh-doanh", name: "Phòng Kinh doanh" },
  { code: "marketing", name: "Phòng Marketing" },
  { code: "ky-thuat", name: "Phòng Kỹ thuật" },
  { code: "du-an", name: "Phòng Dự án" },
  { code: "mua-hang", name: "Phòng Mua hàng" },
  { code: "kho", name: "Kho" },
  { code: "tai-chinh", name: "Phòng Tài chính" },
  { code: "cskh", name: "Chăm sóc khách hàng" },
];

async function main() {
  console.log("=== Seed Cowork Business OS — ITW ===\n");

  // Chốt chặn: không cho phép vai trò AI cầm quyền duyệt hoặc xóa (mục 17, 30).
  const kiemTra = kiemTraGioiHanAI();
  if (!kiemTra.dat) {
    throw new Error(`Vai trò AI vi phạm giới hạn mục 17: ${kiemTra.viPham.join(", ")}`);
  }
  console.log("✓ Kiểm tra giới hạn vai trò AI: đạt");

  // ---- 1. Tenant ----
  const tenant = await prisma.tenant.upsert({
    where: { code: MA_TENANT },
    update: {},
    create: {
      code: MA_TENANT,
      name: "Công ty Cổ phần Thế Giới Tin Học",
      status: "hoat-dong",
    },
  });
  console.log(`✓ Tenant: ${tenant.name} (${tenant.code})`);

  // ---- 2. Danh mục quyền (toàn cục) ----
  const dsQuyen = toanBoQuyen();
  for (const q of dsQuyen) {
    await prisma.permission.upsert({
      where: { code: q.code },
      update: { module: q.module, action: q.action, description: q.description },
      create: q,
    });
  }
  const banDoQuyen = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );
  console.log(`✓ Danh mục quyền: ${dsQuyen.length} quyền`);

  // ---- 3. Phòng ban ----
  for (const pb of PHONG_BAN) {
    await prisma.department.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: pb.code } },
      update: { name: pb.name },
      create: { tenantId: tenant.id, code: pb.code, name: pb.name },
    });
  }
  console.log(`✓ Phòng ban: ${PHONG_BAN.length}`);

  // ---- 4. Vai trò và quyền của vai trò ----
  for (const dinhNghia of VAI_TRO) {
    const vaiTro = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: dinhNghia.code } },
      update: { name: dinhNghia.name, description: dinhNghia.description, isBuiltIn: true },
      create: {
        tenantId: tenant.id,
        code: dinhNghia.code,
        name: dinhNghia.name,
        description: dinhNghia.description,
        isBuiltIn: true,
      },
    });

    const maQuyenCap = dinhNghia.quyen === "*" ? dsQuyen.map((q) => q.code) : dinhNghia.quyen;
    const idQuyenCap = [...new Set(maQuyenCap)]
      .map((m) => banDoQuyen.get(m))
      .filter((v): v is string => Boolean(v));

    // Gỡ quyền thừa rồi cấp quyền thiếu — để sửa định nghĩa vai trò là chạy lại seed được.
    await prisma.rolePermission.deleteMany({
      where: { roleId: vaiTro.id, permissionId: { notIn: idQuyenCap } },
    });
    for (const permissionId of idQuyenCap) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: vaiTro.id, permissionId } },
        update: {},
        create: { tenantId: tenant.id, roleId: vaiTro.id, permissionId },
      });
    }
    console.log(`  · ${dinhNghia.name.padEnd(28)} ${idQuyenCap.length} quyền`);
  }
  console.log(`✓ Vai trò: ${VAI_TRO.length}`);

  // ---- 5. Tài khoản quản trị đầu tiên ----
  const emailAdmin = process.env.SEED_ADMIN_EMAIL;
  const matKhauAdmin = process.env.SEED_ADMIN_PASSWORD;
  if (!emailAdmin || !matKhauAdmin) {
    throw new Error("Thiếu SEED_ADMIN_EMAIL hoặc SEED_ADMIN_PASSWORD trong .env");
  }
  if (matKhauAdmin.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD phải dài từ 10 ký tự trở lên.");
  }

  const daCo = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: emailAdmin } },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: emailAdmin } },
    // Không ghi đè mật khẩu của tài khoản đã tồn tại — tránh seed lại làm mất mật khẩu đã đổi.
    update: {},
    create: {
      tenantId: tenant.id,
      email: emailAdmin,
      passwordHash: await bcrypt.hash(matKhauAdmin, 12),
      fullName: "Quản trị hệ thống",
      status: "hoat-dong",
    },
  });
  console.log(
    daCo
      ? `✓ Tài khoản quản trị đã có sẵn, giữ nguyên mật khẩu: ${emailAdmin}`
      : `✓ Tạo tài khoản quản trị: ${emailAdmin}`,
  );

  const vaiTroCeo = await prisma.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: "ceo" } },
  });
  const vaiTroAdmin = await prisma.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: "admin" } },
  });
  for (const roleId of [vaiTroCeo.id, vaiTroAdmin.id]) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId } },
      update: {},
      create: { tenantId: tenant.id, userId: admin.id, roleId },
    });
  }

  // ---- 6. Tài khoản máy cho trợ lý ITA ----
  const ita = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "ita@he-thong.noi-bo" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "ita@he-thong.noi-bo",
      // Không dùng để đăng nhập: isSystem = true nên route đăng nhập từ chối thẳng.
      passwordHash: await bcrypt.hash(crypto.randomUUID() + crypto.randomUUID(), 12),
      fullName: "ITA — Trợ lý AI",
      isSystem: true,
      status: "hoat-dong",
    },
  });
  const vaiTroAI = await prisma.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: "ai-assistant" } },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: ita.id, roleId: vaiTroAI.id } },
    update: {},
    create: { tenantId: tenant.id, userId: ita.id, roleId: vaiTroAI.id },
  });
  console.log("✓ Tài khoản máy ITA (không đăng nhập được bằng form)");

  // ---- 7. Ghi sự kiện khởi tạo ----
  await prisma.businessEvent.create({
    data: {
      tenantId: tenant.id,
      eventType: "TENANT_CREATED",
      actorType: "system",
      objectType: "tenant",
      objectId: tenant.id,
      payload: { nguon: "seed", phase: 1 },
    },
  });

  console.log("\n=== Seed xong ===");
  console.log(`Đăng nhập tại /dang-nhap với mã doanh nghiệp: ${MA_TENANT}`);
  console.log("ĐỔI MẬT KHẨU QUẢN TRỊ NGAY SAU LẦN ĐĂNG NHẬP ĐẦU TIÊN.");
}

main()
  .catch((loi) => {
    console.error("Seed HỎNG:", loi);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
