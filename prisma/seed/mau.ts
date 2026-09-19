import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { seedNenMong } from "./index";
import { kiemTraMatKhauManh } from "../../src/lib/mat-khau";

/**
 * Dữ liệu MẪU để thử toàn bộ luồng (mục 38 master prompt).
 *
 * Nằm trong một tenant RIÊNG mã "demo" — RLS cách ly nó khỏi tenant thật "itw", nên
 * dữ liệu giả không bao giờ lẫn vào số liệu của Thế Giới Tin Học. Mọi tên người là
 * tên giả, mọi email dùng miền `.test` (miền dành riêng cho thử nghiệm, không gửi thư được).
 *
 * Phase 1 chỉ có người dùng và phòng ban. Khách hàng, sản phẩm, cơ hội, báo giá mẫu
 * được thêm vào tệp này ở phase tương ứng.
 *
 * Chạy:  DEMO_MAT_KHAU=<mật khẩu chung cho tài khoản mẫu> npm run db:seed:mau
 * Trên máy chủ thật: bị chặn, trừ khi đặt thêm CHO_PHEP_DU_LIEU_MAU=1.
 */

if (process.env.NODE_ENV === "production" && process.env.CHO_PHEP_DU_LIEU_MAU !== "1") {
  console.error("Từ chối nạp dữ liệu mẫu trên môi trường thật. Đặt CHO_PHEP_DU_LIEU_MAU=1 nếu thật sự muốn.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL_OWNER.");
const matKhau = process.env.DEMO_MAT_KHAU;
if (!matKhau || kiemTraMatKhauManh(matKhau).length) {
  console.error("Đặt DEMO_MAT_KHAU (tối thiểu 10 ký tự, có chữ và số) — mật khẩu chung cho các tài khoản mẫu.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Sơ đồ tổ chức mẫu: [email, họ tên, phòng ban, chức danh, vai trò, email quản lý]. */
const NHAN_SU: [string, string, string, string, string, string | null][] = [
  ["giamdoc@demo.test", "Trần Văn Mẫu", "ban-giam-doc", "Giám đốc", "ceo", null],
  ["quantri@demo.test", "Lê Thị Quản Trị", "ban-giam-doc", "Quản trị hệ thống", "admin", "giamdoc@demo.test"],
  ["tp.kinhdoanh@demo.test", "Phạm Minh Kinh", "kinh-doanh", "Trưởng phòng Kinh doanh", "sales-manager", "giamdoc@demo.test"],
  ["kd1@demo.test", "Nguyễn Văn An", "kinh-doanh", "Nhân viên kinh doanh dự án", "sales", "tp.kinhdoanh@demo.test"],
  ["kd2@demo.test", "Võ Thị Bình", "kinh-doanh", "Nhân viên kinh doanh doanh nghiệp", "sales", "tp.kinhdoanh@demo.test"],
  ["marketing@demo.test", "Đỗ Thu Hà", "marketing", "Nhân viên Marketing", "marketing", "giamdoc@demo.test"],
  ["tp.kythuat@demo.test", "Hoàng Văn Kỹ", "ky-thuat", "Trưởng phòng Kỹ thuật", "technical-manager", "giamdoc@demo.test"],
  ["ktv1@demo.test", "Bùi Văn Cường", "ky-thuat", "Kỹ thuật viên camera – mạng", "technical", "tp.kythuat@demo.test"],
  ["cskh@demo.test", "Đặng Thị Dung", "cskh", "Chăm sóc khách hàng", "customer-service", "giamdoc@demo.test"],
  ["ketoan@demo.test", "Ngô Thị Em", "tai-chinh", "Kế toán", "finance", "giamdoc@demo.test"],
  ["kho@demo.test", "Lý Văn Giang", "kho", "Thủ kho", "warehouse", "giamdoc@demo.test"],
];

async function main() {
  console.log("=== Dữ liệu mẫu — tenant demo ===\n");
  const tenant = await seedNenMong(db, "demo", "Công ty Mẫu (dữ liệu thử — không phải dữ liệu thật)");
  const bam = await bcrypt.hash(matKhau!, 12);
  const idTheoEmail = new Map<string, string>();

  for (const [email, hoTen, maPhong, chucDanh, maVaiTro] of NHAN_SU) {
    const phong = await db.department.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code: maPhong } } });
    const vaiTro = await db.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code: maVaiTro } } });
    const u = await db.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: {},
      create: { tenantId: tenant.id, email, fullName: hoTen, passwordHash: bam, passwordChangedAt: new Date() },
    });
    idTheoEmail.set(email, u.id);
    await db.staffProfile.upsert({
      where: { userId: u.id },
      update: {},
      create: { tenantId: tenant.id, userId: u.id, departmentId: phong.id, jobTitle: chucDanh },
    });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId: vaiTro.id } },
      update: {},
      create: { tenantId: tenant.id, userId: u.id, roleId: vaiTro.id },
    });
  }
  // Gán quản lý sau khi mọi người đã có, để thứ tự khai báo không quan trọng.
  for (const [email, , , , , quanLy] of NHAN_SU) {
    if (!quanLy) continue;
    await db.staffProfile.update({ where: { userId: idTheoEmail.get(email)! }, data: { managerId: idTheoEmail.get(quanLy)! } });
  }

  console.log(`\n✓ ${NHAN_SU.length} tài khoản mẫu, mã doanh nghiệp "demo", mật khẩu = DEMO_MAT_KHAU.`);
  console.log("  Thử phạm vi dữ liệu: đăng nhập tp.kinhdoanh@demo.test (thấy nhóm), kd1@demo.test (chỉ thấy mình).");
}

main()
  .catch((e) => {
    console.error("Nạp dữ liệu mẫu HỎNG:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
