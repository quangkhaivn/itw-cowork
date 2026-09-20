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

  await seedCrmMau(tenant.id, idTheoEmail);
  await seedSanPhamMau(tenant.id, idTheoEmail);

  console.log(`\n✓ ${NHAN_SU.length} tài khoản mẫu, mã doanh nghiệp "demo", mật khẩu = DEMO_MAT_KHAU.`);
  console.log("  Thử phạm vi dữ liệu: đăng nhập tp.kinhdoanh@demo.test (thấy nhóm), kd1@demo.test (chỉ thấy mình).");
}

/**
 * CRM mẫu (Phase 2): tạo QUA SERVICE thật, bằng đúng tài khoản nhân viên mẫu, để dữ liệu
 * mẫu đi qua cùng luật với dữ liệu thật (chống trùng, CH-02, nhật ký). Chỉ chạy khi
 * tenant demo chưa có khách hàng nào — chạy lại không nhân đôi.
 * Tên doanh nghiệp đều có chữ "Mẫu"; không dùng mã số thuế (không mượn MST của ai).
 */
async function seedCrmMau(tenantId: string, id: Map<string, string>) {
  if ((await db.customer.count({ where: { tenantId } })) > 0) {
    console.log("✓ CRM mẫu đã có — bỏ qua");
    return;
  }
  const { voiTenant } = await import("../../src/lib/db");
  const { taoNguCanh } = await import("../../src/lib/api");
  const { layHoSoQuyen } = await import("../../src/lib/phan-quyen");
  const kh = await import("../../src/modules/khach-hang/service");
  const ch = await import("../../src/modules/co-hoi/service");
  const ld = await import("../../src/modules/lead/service");
  const tt = await import("../../src/modules/tuong-tac/service");
  const cv = await import("../../src/modules/cong-viec/service");
  const { LuocDoTaoKhachHang } = await import("../../src/modules/khach-hang/luoc-do");
  const { LuocDoTaoCoHoi } = await import("../../src/modules/co-hoi/luoc-do");
  const { LuocDoTaoLead } = await import("../../src/modules/lead/luoc-do");
  type NC = Parameters<typeof kh.taoKhachHang>[0];

  const voi = <T>(email: string, viec: (nc: NC) => Promise<T>) =>
    voiTenant(tenantId, async (tx) => {
      const hoSo = await layHoSoQuyen(tx, id.get(email)!);
      if (!hoSo) throw new Error(`Không đọc được quyền của ${email}`);
      return viec(taoNguCanh(tx, tenantId, hoSo, null, "seed-mau"));
    });
  const ngay = (lech: number) => new Date(Date.now() + lech * 86_400_000).toISOString().slice(0, 10);

  // --- Nhân viên KD 1 ---
  const nhaMay = await voi("kd1@demo.test", (nc) =>
    kh.taoKhachHang(nc, LuocDoTaoKhachHang.parse({
      ten: "Công ty TNHH Mẫu Bao Bì An Phú",
      loaiKhach: "doanh-nghiep",
      phanKhuc: "nha-may",
      nganh: "san-xuat",
      nguon: "website",
      dienThoai: "0900 000 101",
      diaChi: "Khu công nghiệp Mẫu, Bình Dương",
      lienHe: { hoTen: "Nguyễn Thị Mua Hàng", chucDanh: "Trưởng phòng Mua hàng", dienThoai: "0900 000 102", email: "muahang@anphu-mau.test" },
    })),
  );
  const truong = await voi("kd1@demo.test", (nc) =>
    kh.taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Trường THCS Mẫu Bình Minh", loaiKhach: "doanh-nghiep", phanKhuc: "truong-hoc", nganh: "giao-duc", nguon: "gioi-thieu" })),
  );
  const camera = await voi("kd1@demo.test", (nc) =>
    ch.taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: nhaMay.id, tieuDe: "30 camera nhà xưởng", giaTri: "90000000", hanhDongKeTiep: "Gửi báo giá camera", ngayHanhDong: ngay(1), ngayDuKienChot: ngay(20) })),
  );
  await voi("kd1@demo.test", (nc) => ch.doiGiaiDoan(nc, camera.id, { giaiDoan: "QUOTATION" }));
  const phongMay = await voi("kd1@demo.test", (nc) =>
    ch.taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: truong.id, tieuDe: "Phòng máy 40 PC", giaTri: "480000000", hanhDongKeTiep: "Họp ban giám hiệu chốt cấu hình", ngayHanhDong: ngay(3), ngayDuKienChot: ngay(45) })),
  );
  await voi("kd1@demo.test", (nc) => ch.doiGiaiDoan(nc, phongMay.id, { giaiDoan: "NEGOTIATION" }));
  const ups = await voi("kd1@demo.test", (nc) =>
    ch.taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: nhaMay.id, tieuDe: "Bộ lưu điện cho phòng máy chủ", giaTri: "35000000", hanhDongKeTiep: "Giao hàng", ngayHanhDong: ngay(0) })),
  );
  await voi("kd1@demo.test", (nc) => ch.doiGiaiDoan(nc, ups.id, { giaiDoan: "WON" }));
  await voi("kd1@demo.test", (nc) =>
    tt.ghiTuongTac(nc, { loai: "meeting", tieuDe: "Khảo sát mặt bằng nhà xưởng", noiDung: "Cần 30 điểm camera, 2 đầu ghi", ketQua: "Hẹn gửi báo giá", coHoiId: camera.id, khachHangId: null, lienHeId: null, leadId: null, luc: null }),
  );
  await voi("kd1@demo.test", (nc) =>
    cv.taoViec(nc, { tieuDe: "Gửi báo giá camera cho An Phú", uuTien: "cao", han: new Date(Date.now() + 86_400_000), coHoiId: camera.id, khachHangId: null, leadId: null, moTa: null, nguoiPhuTrachId: null }),
  );
  await voi("kd1@demo.test", (nc) =>
    ld.taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Chị Mai", congTy: "Văn phòng Mẫu Sao Việt", dienThoai: "0900 000 201", nguon: "website", nhuCau: "15 laptop văn phòng, ngân sách khoảng 15 triệu/máy", giaTriUocTinh: "225000000" })),
  );

  // --- Nhân viên KD 2 ---
  const chuoi = await voi("kd2@demo.test", (nc) =>
    kh.taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Chuỗi cửa hàng Mẫu Hạnh Phúc", loaiKhach: "doanh-nghiep", phanKhuc: "chuoi-cua-hang", nganh: "ban-le", nguon: "zalo", dienThoai: "0900 000 301" })),
  );
  await voi("kd2@demo.test", (nc) =>
    ch.taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: chuoi.id, tieuDe: "Wifi cho 12 cửa hàng", giaTri: "60000000", hanhDongKeTiep: "Gọi lại xác nhận số điểm phát", ngayHanhDong: ngay(-2) })),
  );
  const nas = await voi("kd2@demo.test", (nc) =>
    ch.taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: chuoi.id, tieuDe: "Máy chủ lưu trữ", giaTri: "120000000", hanhDongKeTiep: "Gửi phương án", ngayHanhDong: ngay(0) })),
  );
  await voi("kd2@demo.test", (nc) => ch.doiGiaiDoan(nc, nas.id, { giaiDoan: "LOST", lyDoThua: "gia-cao", ghiChuThua: "Dữ liệu mẫu" }));
  const leadTuan = await voi("kd2@demo.test", (nc) =>
    ld.taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Anh Tuấn", congTy: "Xưởng Mẫu Cơ Khí Tân Tiến", dienThoai: "0900 000 401", nguon: "zalo", nhuCau: "Camera + tổng đài nội bộ" })),
  );
  await voi("kd2@demo.test", (nc) =>
    tt.ghiTuongTac(nc, { loai: "zalo", tieuDe: "Nhắn Zalo giới thiệu", leadId: leadTuan.id, khachHangId: null, lienHeId: null, coHoiId: null, noiDung: null, ketQua: "Khách hẹn tuần sau", luc: null }),
  );
  await voi("kd2@demo.test", (nc) =>
    cv.taoViec(nc, { tieuDe: "Gọi lại anh Tuấn", uuTien: "trung-binh", han: new Date(Date.now() - 86_400_000), leadId: leadTuan.id, khachHangId: null, coHoiId: null, moTa: null, nguoiPhuTrachId: null }),
  );
  console.log("✓ CRM mẫu: 3 khách hàng, 5 cơ hội, 2 lead, tương tác và công việc (tạo qua service)");
}

/**
 * Sản phẩm và bảng giá mẫu (Phase 3) — cũng tạo qua service bằng tài khoản Mua hàng mẫu.
 * Giá là số minh họa của tenant `demo`, KHÔNG phải giá thật của TGTH.
 */
async function seedSanPhamMau(tenantId: string, id: Map<string, string>) {
  if ((await db.product.count({ where: { tenantId } })) > 0) {
    console.log("✓ Sản phẩm mẫu đã có — bỏ qua");
    return;
  }
  const { voiTenant } = await import("../../src/lib/db");
  const { taoNguCanh } = await import("../../src/lib/api");
  const { layHoSoQuyen } = await import("../../src/lib/phan-quyen");
  const ncc = await import("../../src/modules/nha-cung-cap/service");
  const sp = await import("../../src/modules/san-pham/service");
  const dm = await import("../../src/modules/danh-muc-san-pham/service");
  const { LuocDoTaoSanPham } = await import("../../src/modules/san-pham/luoc-do");
  type NC = Parameters<typeof sp.taoSanPham>[0];

  // Mua hàng mẫu: dùng tài khoản kho (có quyền product/supplier hạn chế) không đủ, nên dùng quản trị mẫu.
  const voi = <T>(email: string, viec: (nc: NC) => Promise<T>) =>
    voiTenant(tenantId, async (tx) => {
      const hoSo = await layHoSoQuyen(tx, id.get(email)!);
      if (!hoSo) throw new Error(`Không đọc được quyền của ${email}`);
      return viec(taoNguCanh(tx, tenantId, hoSo, null, "seed-mau"));
    });
  const QT = "quantri@demo.test";

  const dell = await voi(QT, (nc) => dm.taoThuongHieu(nc, { ma: "dell", ten: "Dell", website: null, ghiChu: null }));
  const hik = await voi(QT, (nc) => dm.taoThuongHieu(nc, { ma: "hikvision", ten: "Hikvision", website: null, ghiChu: null }));
  const nhom = await voi(QT, (nc) => dm.cayNhomSanPham(nc));
  const maNhom = (ma: string) => nhom.find((n) => n.ma === ma)?.id ?? null;

  const anPhat = await voi(QT, (nc) =>
    ncc.taoNhaCungCap(nc, { ten: "Công ty Mẫu Phân Phối An Phát", maSoThue: null, nguoiLienHe: "Anh Phát", dienThoai: "0900 000 501", email: null, diaChi: null, website: null, dieuKhoanThanhToan: null, soNgayGiao: 3, ghiChu: null }),
  );
  const minhTin = await voi(QT, (nc) =>
    ncc.taoNhaCungCap(nc, { ten: "Nhà phân phối Mẫu Minh Tín", maSoThue: null, nguoiLienHe: "Chị Tín", dienThoai: "0900 000 502", email: null, diaChi: null, website: null, dieuKhoanThanhToan: null, soNgayGiao: 7, ghiChu: null }),
  );

  const dsSp: [string, string, string | null, string | null, string, string][] = [
    ["LAP-DELL-3420", "Laptop Dell Vostro 3420 i5-1235U 8GB 256GB", maNhom("laptop"), dell.id, "15200000", "17900000"],
    ["PC-VP-I5", "PC văn phòng i5 12400 / 8GB / SSD 512GB", maNhom("desktop"), null, "9800000", "12500000"],
    ["CAM-HIK-2MP", "Camera Hikvision 2MP hồng ngoại 30m", maNhom("camera"), hik.id, "780000", "1150000"],
    ["SW-24P", "Switch 24 cổng Gigabit", maNhom("mang"), null, "2100000", "2950000"],
    ["DV-LAP-DAT", "Dịch vụ lắp đặt và cấu hình tại chỗ", maNhom("dich-vu"), null, "0", "500000"],
  ];
  const daTao: { id: string; sku: string }[] = [];
  for (const [sku, ten, nhomId, thuongHieuId, giaVon, giaBan] of dsSp) {
    const p = await voi(QT, (nc) =>
      sp.taoSanPham(nc, LuocDoTaoSanPham.parse({ sku, ten, nhomId, thuongHieuId, donViTinh: sku.startsWith("DV-") ? "lan" : "cai", giaVon, giaBan })),
    );
    daTao.push({ id: p.id, sku: p.sku });
  }

  // Hai nguồn cho laptop và camera để thấy chức năng "nguồn nên mua".
  const gia: [string, string, string, "con-hang" | "het-hang" | "dat-truoc"][] = [
    ["LAP-DELL-3420", anPhat.id, "15200000", "con-hang"],
    ["LAP-DELL-3420", minhTin.id, "14950000", "het-hang"],
    ["CAM-HIK-2MP", anPhat.id, "790000", "con-hang"],
    ["CAM-HIK-2MP", minhTin.id, "765000", "con-hang"],
    ["SW-24P", anPhat.id, "2100000", "dat-truoc"],
  ];
  for (const [sku, nhaCungCapId, giaMua, tinhTrang] of gia) {
    const p = daTao.find((x) => x.sku === sku)!;
    await voi(QT, (nc) =>
      sp.datGiaNguon(nc, p.id, { nhaCungCapId, giaMua, tinhTrang, soNgayGiao: tinhTrang === "con-hang" ? 2 : 7, thamChieu: "Bảng giá mẫu", ghiChu: null, lyDo: "Giá khởi tạo mẫu" }),
    );
  }
  console.log("✓ Sản phẩm mẫu: 5 sản phẩm, 2 nhà cung cấp, 5 dòng giá (tạo qua service)");
}

main()
  .catch((e) => {
    console.error("Nạp dữ liệu mẫu HỎNG:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
