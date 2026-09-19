import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { VAI_TRO, toanBoQuyen, kiemTraGioiHanAI } from "../../src/lib/vai-tro";
import { LOAI_DU_LIEU_GOC } from "../../src/modules/du-lieu-goc/loai";
import { kiemTraMatKhauManh } from "../../src/lib/mat-khau";

/**
 * Seed nền móng.
 *
 * Chạy bằng vai CHỦ SỞ HỮU (DATABASE_URL_OWNER) để không bị RLS chặn.
 * Idempotent và chạy ở MỌI lần triển khai (trien-khai.sh bước 6), nên phải tuân một luật:
 *
 *   KHÔNG ĐÈ LÊN CHỈNH SỬA CỦA CON NGƯỜI.
 *
 *   - Vai trò dựng sẵn: lần đầu tạo thì cấp đủ quyền theo định nghĩa. Những lần sau
 *     CHỈ cấp các mã quyền MỚI xuất hiện (phân hệ mới của phase sau). Quyền Giám đốc
 *     đã gỡ trên giao diện thì không cấp lại. (Bản 12/09 đồng bộ cứng mỗi lần chạy —
 *     tức mỗi lần triển khai sẽ xóa sạch phân quyền đã chỉnh. Đã sửa.)
 *   - Riêng Giám đốc và Quản trị luôn được đồng bộ đủ toàn quyền: đó là lối thoát.
 *   - Riêng trợ lý AI luôn bị gỡ mọi quyền duyệt/xóa nếu lỡ có: đó là bất biến an toàn.
 *   - Dữ liệu gốc: chỉ thêm mục còn thiếu, không đổi tên, không bật lại mục đã tắt.
 *
 * KHÔNG tạo dữ liệu nghiệp vụ giả (khách hàng, đơn hàng, doanh thu) trong tenant thật.
 * Dữ liệu mẫu để thử nằm ở prisma/seed/mau.ts, trong một tenant riêng tên "demo".
 */

const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL_OWNER (hoặc DATABASE_URL).");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const MA_TENANT = process.env.SEED_MA_TENANT ?? "itw";
const TEN_TENANT = process.env.SEED_TEN_TENANT ?? "Công ty Cổ phần Thế Giới Tin Học";

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

const TOAN_QUYEN = new Set(["ceo", "admin"]);

export async function seedNenMong(db: PrismaClient, maTenant: string, tenTenant: string) {
  // Chốt chặn: không cho phép vai trò AI cầm quyền duyệt hoặc xóa.
  const kiemTra = kiemTraGioiHanAI();
  if (!kiemTra.dat) {
    throw new Error(`Vai trò AI vi phạm giới hạn: ${kiemTra.viPham.join(", ")}`);
  }
  console.log("✓ Kiểm tra giới hạn vai trò AI trong định nghĩa: đạt");

  // ---- 1. Tenant ----
  const tenant = await db.tenant.upsert({
    where: { code: maTenant },
    update: {},
    create: { code: maTenant, name: tenTenant, status: "hoat-dong" },
  });
  console.log(`✓ Tenant: ${tenant.name} (${tenant.code})`);

  // ---- 2. Danh mục quyền (toàn cục) — ghi nhận mã nào là MỚI ----
  const maDaCo = new Set((await db.permission.findMany({ select: { code: true } })).map((p) => p.code));
  const dsQuyen = toanBoQuyen();
  for (const q of dsQuyen) {
    await db.permission.upsert({
      where: { code: q.code },
      update: { module: q.module, action: q.action, description: q.description },
      create: q,
    });
  }
  const maMoi = new Set(dsQuyen.map((q) => q.code).filter((m) => !maDaCo.has(m)));
  const banDoQuyen = new Map(
    (await db.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );
  console.log(`✓ Danh mục quyền: ${dsQuyen.length} quyền (${maMoi.size} mã mới)`);

  // ---- 3. Phòng ban (chỉ tạo phòng còn thiếu, không đổi tên phòng đã sửa) ----
  for (const pb of PHONG_BAN) {
    await db.department.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: pb.code } },
      update: {},
      create: { tenantId: tenant.id, code: pb.code, name: pb.name },
    });
  }
  console.log(`✓ Phòng ban: ${PHONG_BAN.length}`);

  // ---- 4. Vai trò và quyền của vai trò ----
  for (const dn of VAI_TRO) {
    const daCoVaiTro = await db.role.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: dn.code } },
      select: { id: true },
    });
    const vaiTro = await db.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: dn.code } },
      // Không đè tên/mô tả đã sửa trên giao diện; đổi tên vai trò dựng sẵn thì làm bằng migration.
      update: { isBuiltIn: true },
      create: { tenantId: tenant.id, code: dn.code, name: dn.name, description: dn.description, isBuiltIn: true },
    });

    const maTheoDinhNghia = dn.quyen === "*" ? dsQuyen.map((q) => q.code) : [...new Set(dn.quyen)];
    let canCap: string[];
    if (TOAN_QUYEN.has(dn.code)) {
      canCap = maTheoDinhNghia; // Lối thoát: luôn đủ toàn quyền.
    } else if (!daCoVaiTro) {
      canCap = maTheoDinhNghia; // Vai trò mới: cấp đủ theo định nghĩa.
    } else {
      canCap = maTheoDinhNghia.filter((m) => maMoi.has(m)); // Chỉ quyền của phân hệ mới.
    }

    const truocKhiCap = await db.rolePermission.count({ where: { roleId: vaiTro.id } });
    for (const ma of canCap) {
      const permissionId = banDoQuyen.get(ma);
      if (!permissionId) continue;
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: vaiTro.id, permissionId } },
        update: {},
        create: { tenantId: tenant.id, roleId: vaiTro.id, permissionId, dataScope: dn.phamVi },
      });
    }

    // Bất biến AI: gỡ mọi quyền duyệt/xóa nếu lỡ có trong cơ sở dữ liệu (ai đó sửa tay).
    if (dn.code === "ai-assistant") {
      const go = await db.rolePermission.deleteMany({
        where: {
          roleId: vaiTro.id,
          OR: [{ permission: { code: { endsWith: ".approve" } } }, { permission: { code: { endsWith: ".delete" } } }],
        },
      });
      if (go.count) console.log(`  ⚠ Đã gỡ ${go.count} quyền duyệt/xóa khỏi vai trò AI`);
    }

    const tong = await db.rolePermission.count({ where: { roleId: vaiTro.id } });
    const soCap = tong - truocKhiCap;
    console.log(`  · ${dn.name.padEnd(34)} ${String(tong).padStart(3)} quyền${soCap ? ` (+${soCap})` : ""}`);
  }
  console.log(`✓ Vai trò: ${VAI_TRO.length}`);

  // ---- 5. Dữ liệu gốc ----
  let soMucMoi = 0;
  for (const loai of LOAI_DU_LIEU_GOC) {
    for (const [i, m] of loai.khoiTao.entries()) {
      const daCo = await db.masterDataItem.findUnique({
        where: { tenantId_type_code: { tenantId: tenant.id, type: loai.ma, code: m.ma } },
        select: { id: true },
      });
      if (daCo) continue;
      await db.masterDataItem.create({
        data: { tenantId: tenant.id, type: loai.ma, code: m.ma, name: m.ten, sortOrder: (i + 1) * 10 },
      });
      soMucMoi++;
    }
  }
  console.log(`✓ Dữ liệu gốc: ${LOAI_DU_LIEU_GOC.length} loại, thêm ${soMucMoi} mục`);

  // ---- 6. Tài khoản máy cho trợ lý ITA ----
  const ita = await db.user.upsert({
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
  const vaiTroAI = await db.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: "ai-assistant" } },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: ita.id, roleId: vaiTroAI.id } },
    update: {},
    create: { tenantId: tenant.id, userId: ita.id, roleId: vaiTroAI.id },
  });
  console.log("✓ Tài khoản máy ITA (không đăng nhập được bằng form)");

  return tenant;
}

async function taoQuanTriDauTien(db: PrismaClient, tenantId: string) {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const matKhau = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !matKhau) {
    throw new Error("Thiếu SEED_ADMIN_EMAIL hoặc SEED_ADMIN_PASSWORD trong .env");
  }

  const daCo = await db.user.findUnique({ where: { tenantId_email: { tenantId, email } } });
  if (!daCo) {
    const loi = kiemTraMatKhauManh(matKhau, email);
    if (loi.length) throw new Error(`SEED_ADMIN_PASSWORD chưa đạt: ${loi.join(" ")}`);
  }

  const admin = await db.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    // Không ghi đè mật khẩu của tài khoản đã tồn tại — tránh seed lại làm mất mật khẩu đã đổi.
    update: {},
    create: {
      tenantId,
      email,
      passwordHash: await bcrypt.hash(matKhau, 12),
      fullName: "Quản trị hệ thống",
      status: "hoat-dong",
      // Mật khẩu seed nằm trong tệp .env → coi như đã lộ, bắt đổi ở lần đăng nhập đầu.
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    },
  });
  console.log(daCo ? `✓ Tài khoản quản trị đã có sẵn, giữ nguyên mật khẩu: ${email}` : `✓ Tạo tài khoản quản trị: ${email}`);

  for (const code of ["ceo", "admin"]) {
    const vt = await db.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code } } });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: vt.id } },
      update: {},
      create: { tenantId, userId: admin.id, roleId: vt.id },
    });
  }
}

async function main() {
  console.log("=== Seed nền móng — TGTH Business Cowork ===\n");
  const tenant = await seedNenMong(prisma, MA_TENANT, TEN_TENANT);
  await taoQuanTriDauTien(prisma, tenant.id);

  const daGhiKhoiTao = await prisma.businessEvent.count({
    where: { tenantId: tenant.id, eventType: "TENANT_CREATED" },
  });
  if (!daGhiKhoiTao) {
    await prisma.businessEvent.create({
      data: {
        tenantId: tenant.id,
        eventType: "TENANT_CREATED",
        actorType: "system",
        objectType: "tenant",
        objectId: tenant.id,
        payload: { nguon: "seed" },
      },
    });
  }

  console.log("\n=== Seed xong ===");
  console.log(`Đăng nhập tại /dang-nhap với mã doanh nghiệp: ${MA_TENANT}`);
}

// Chỉ chạy khi gọi trực tiếp (npm run db:seed), không chạy khi tệp khác import seedNenMong.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed/index.ts")) {
  main()
    .catch((loi) => {
      console.error("Seed HỎNG:", loi);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
