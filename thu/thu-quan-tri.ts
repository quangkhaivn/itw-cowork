import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, idNguoiTrongPhamVi, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiNghiepVu } from "../src/lib/loi";
import { kiemTraMatKhau } from "../src/lib/xac-thuc";
import { taoNguoiDung, suaNguoiDung, datLaiMatKhau, doiMatKhauCuaToi } from "../src/modules/nguoi-dung/service";
import { suaVaiTro, taoVaiTro } from "../src/modules/vai-tro/service";
import { taoPhongBan, suaPhongBan } from "../src/modules/phong-ban/service";
import { capNhatCauHinh, docCauHinh } from "../src/modules/cau-hinh/service";
import { taoMuc } from "../src/modules/du-lieu-goc/service";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, datNemLoi, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng các bất biến quản trị của Phase 1 trên cơ sở dữ liệu THẬT, qua đúng
 * service mà API gọi (cùng voiTenant + RLS + kiểm quyền).
 *
 * Dùng một tenant thử riêng "thu-qt". Tenant này KHÔNG xóa được sau khi chạy vì
 * audit_logs và business_events chặn xóa ở tầng CSDL — đó là chủ đích. Vì vậy:
 * CHỈ chạy trên cơ sở dữ liệu phát triển, không chạy trên máy chủ thật.
 *
 * Chạy: npm run thu:quan-tri
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn (nhật ký không xóa được). Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = `t${Date.now().toString(36)}`;
const email = (ten: string) => `${ten}.${DAU}@thu.test`;

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-quan-tri"));
  });
}

async function nemLoiKieu(ten: string, kieu: "nghiep-vu" | "quyen", khoi: () => Promise<unknown>, chua?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu = kieu === "quyen" ? e instanceof LoiThieuQuyen : e instanceof LoiNghiepVu;
    const dungNoiDung = !chua || (e instanceof Error && e.message.includes(chua));
    dat(ten, dungKieu && dungNoiDung, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function main() {
  console.log("=== Thử quản trị (Phase 1) ===\n");
  const tenant = await seedNenMong(chu, "thu-qt", "Doanh nghiệp thử quản trị");
  const vaiTro = async (code: string) =>
    (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code } } })).id;

  // Quản trị viên đầu tiên của tenant thử — dựng thẳng bằng vai chủ sở hữu.
  const qt = await chu.user.create({
    data: {
      tenantId: tenant.id,
      email: email("quan-tri"),
      passwordHash: "x",
      fullName: "Quản trị thử",
      userRoles: { create: { tenantId: tenant.id, roleId: await vaiTro("admin") } },
    },
  });
  const T = tenant.id;
  console.log("");

  // --- 1. Tạo người dùng ---
  await nemLoiKieu("Mật khẩu yếu bị từ chối khi tạo người dùng", "nghiep-vu", () =>
    voi(T, qt.id, (nc) =>
      taoNguoiDung(nc, {
        email: email("yeu"),
        hoTen: "Mật khẩu yếu",
        vaiTroIds: [],
        matKhauKhoiTao: "123",
        batDoiMatKhau: true,
      }),
    ),
  );

  const truongPhong = await voi(T, qt.id, async (nc) =>
    taoNguoiDung(nc, {
      email: email("truong-phong"),
      hoTen: "Trưởng phòng Thử",
      vaiTroIds: [await vaiTro("sales-manager")],
      matKhauKhoiTao: "TruongPhong-2026",
      batDoiMatKhau: true,
    }),
  );
  dat("Tạo được người dùng có vai trò", truongPhong.vaiTro.some((v) => v.code === "sales-manager"));

  const nv1 = await voi(T, qt.id, async (nc) =>
    taoNguoiDung(nc, {
      email: email("nv1"),
      hoTen: "Nhân viên 1",
      quanLyId: truongPhong.id,
      vaiTroIds: [await vaiTro("sales")],
      matKhauKhoiTao: "NhanVien1-2026",
      batDoiMatKhau: false,
    }),
  );
  const nv2 = await voi(T, qt.id, async (nc) =>
    taoNguoiDung(nc, {
      email: email("nv2"),
      hoTen: "Nhân viên 2 (cấp dưới của NV1)",
      quanLyId: nv1.id,
      vaiTroIds: [await vaiTro("sales")],
      matKhauKhoiTao: "NhanVien2-2026",
      batDoiMatKhau: false,
    }),
  );
  const nguoiNgoai = await voi(T, qt.id, async (nc) =>
    taoNguoiDung(nc, {
      email: email("ngoai"),
      hoTen: "Người phòng khác",
      vaiTroIds: [await vaiTro("sales")],
      matKhauKhoiTao: "NguoiNgoai-2026",
      batDoiMatKhau: false,
    }),
  );

  const ghiTao = await chu.auditLog.findFirst({ where: { tenantId: T, action: "tao", objectType: "user", objectId: truongPhong.id } });
  dat("Tạo người dùng có ghi Audit Log", Boolean(ghiTao));
  dat("Audit Log không chứa mật khẩu hay mã băm", !JSON.stringify(ghiTao?.after ?? {}).toLowerCase().includes("password"));

  await nemLoiKieu("Email trùng bị từ chối", "nghiep-vu", () =>
    voi(T, qt.id, (nc) =>
      taoNguoiDung(nc, { email: email("nv1"), hoTen: "Trùng", vaiTroIds: [], matKhauKhoiTao: "TrungEmail-2026", batDoiMatKhau: true }),
    ),
  );
  await nemLoiKieu("Không gán được vai trò Trợ lý AI cho người", "nghiep-vu", async () =>
    voi(T, qt.id, async (nc) =>
      taoNguoiDung(nc, {
        email: email("gia-ai"),
        hoTen: "Giả AI",
        vaiTroIds: [await vaiTro("ai-assistant")],
        matKhauKhoiTao: "GiaTroLy-2026",
        batDoiMatKhau: true,
      }),
    ),
  );

  // --- 2. Chuỗi quản lý không được vòng ---
  await nemLoiKieu(
    "Chặn vòng quản lý (trưởng phòng nhận cấp dưới của mình làm quản lý)",
    "nghiep-vu",
    () => voi(T, qt.id, (nc) => suaNguoiDung(nc, truongPhong.id, { quanLyId: nv2.id })),
    "vòng",
  );

  // --- 3. Phạm vi dữ liệu team: trưởng phòng thấy mình + NV1 + NV2 (gián tiếp), không thấy người ngoài ---
  const phamViTeam = await voiTenant(T, async (tx) => {
    const hs = await layHoSoQuyen(tx, truongPhong.id);
    return idNguoiTrongPhamVi(tx, hs!, "customer.view");
  });
  const dsTeam = phamViTeam === "tat-ca" ? [] : phamViTeam;
  dat("Phạm vi team gồm cấp dưới trực tiếp và gián tiếp", [truongPhong.id, nv1.id, nv2.id].every((id) => dsTeam.includes(id)), JSON.stringify(dsTeam));
  dat("Phạm vi team KHÔNG gồm người ngoài nhóm", !dsTeam.includes(nguoiNgoai.id));

  const phamViOwn = await voiTenant(T, async (tx) => idNguoiTrongPhamVi(tx, (await layHoSoQuyen(tx, nv1.id))!, "customer.view"));
  dat("Nhân viên kinh doanh (own) chỉ thấy chính mình", Array.isArray(phamViOwn) && phamViOwn.length === 1 && phamViOwn[0] === nv1.id);
  const phamViKhongQuyen = await voiTenant(T, async (tx) => idNguoiTrongPhamVi(tx, (await layHoSoQuyen(tx, nv1.id))!, "finance.view"));
  dat("Không có quyền thì phạm vi rỗng", Array.isArray(phamViKhongQuyen) && phamViKhongQuyen.length === 0);

  // --- 4. Phạm vi phòng ban: gồm phòng con ---
  const pbCha = await voi(T, qt.id, (nc) => taoPhongBan(nc, { ma: `${DAU}-cha`, ten: "Phòng cha thử" }));
  const pbCon = await voi(T, qt.id, (nc) => taoPhongBan(nc, { ma: `${DAU}-con`, ten: "Phòng con thử", chaId: pbCha.id }));
  await nemLoiKieu("Chặn đặt phòng con làm cha của phòng cha", "nghiep-vu", () =>
    voi(T, qt.id, (nc) => suaPhongBan(nc, pbCha.id, { chaId: pbCon.id })),
  );
  await voi(T, qt.id, (nc) => suaNguoiDung(nc, qt.id, { phongBanId: pbCha.id }));
  await voi(T, qt.id, (nc) => suaNguoiDung(nc, nguoiNgoai.id, { phongBanId: pbCon.id }));
  const vaiTroPhongBan = await voi(T, qt.id, (nc) => taoVaiTro(nc, { ma: `${DAU}-pb`, ten: "Vai trò phạm vi phòng ban", moTa: "" }));
  await voi(T, qt.id, (nc) => suaVaiTro(nc, vaiTroPhongBan.id, { quyen: [{ ma: "customer.view", phamVi: "department" }] }));
  const truongPhongBan = await voi(T, qt.id, (nc) =>
    taoNguoiDung(nc, {
      email: email("truong-pb"),
      hoTen: "Trưởng phòng ban",
      phongBanId: pbCha.id,
      vaiTroIds: [vaiTroPhongBan.id],
      matKhauKhoiTao: "TruongPhongBan-2026",
      batDoiMatKhau: false,
    }),
  );
  const pvPb = await voiTenant(T, async (tx) => idNguoiTrongPhamVi(tx, (await layHoSoQuyen(tx, truongPhongBan.id))!, "customer.view"));
  dat("Phạm vi phòng ban gồm người ở phòng con", Array.isArray(pvPb) && pvPb.includes(nguoiNgoai.id) && pvPb.includes(qt.id));
  await nemLoiKieu("Chặn ngừng phòng ban còn nhân sự", "nghiep-vu", () =>
    voi(T, qt.id, (nc) => suaPhongBan(nc, pbCon.id, { trangThai: "ngung-hoat-dong" })),
  );

  // --- 5. Không khóa được quản trị cuối cùng, không tự khóa mình ---
  await nemLoiKieu("Không tự khóa tài khoản của chính mình", "nghiep-vu", () =>
    voi(T, qt.id, (nc) => suaNguoiDung(nc, qt.id, { trangThai: "ngung-hoat-dong" })),
  );
  await nemLoiKieu(
    "Không gỡ được vai trò quản trị của người quản trị cuối cùng",
    "nghiep-vu",
    async () => voi(T, qt.id, async (nc) => suaNguoiDung(nc, qt.id, { vaiTroIds: [await vaiTro("sales")] })),
    "ít nhất một người",
  );
  const vanLaAdmin = await chu.userRole.count({ where: { userId: qt.id, role: { code: "admin" } } });
  dat("Sau lần bị chặn, quản trị viên vẫn giữ vai trò (giao dịch đã cuộn ngược)", vanLaAdmin === 1);

  // --- 6. Vai trò: bất biến AI, vai trò khóa, chống leo thang quyền ---
  await nemLoiKieu(
    "Không cấp được quyền duyệt báo giá cho Trợ lý AI",
    "nghiep-vu",
    async () => voi(T, qt.id, async (nc) => suaVaiTro(nc, await vaiTro("ai-assistant"), { quyen: [{ ma: "quotation.approve", phamVi: "all" }] })),
    "Trợ lý AI",
  );
  await nemLoiKieu("Không sửa được quyền của vai trò Giám đốc", "nghiep-vu", async () =>
    voi(T, qt.id, async (nc) => suaVaiTro(nc, await vaiTro("ceo"), { quyen: [] })),
  );
  const vaiTroPhanQuyen = await voi(T, qt.id, (nc) => taoVaiTro(nc, { ma: `${DAU}-pq`, ten: "Người phân quyền hẹp", moTa: "" }));
  await voi(T, qt.id, (nc) =>
    suaVaiTro(nc, vaiTroPhanQuyen.id, {
      quyen: [
        { ma: "role.view", phamVi: "all" },
        { ma: "role.update", phamVi: "all" },
      ],
    }),
  );
  await voi(T, qt.id, (nc) => suaNguoiDung(nc, nv1.id, { vaiTroIds: [vaiTroPhanQuyen.id] }));
  await nemLoiKieu(
    "Người có quyền sửa vai trò KHÔNG cấp được quyền mà chính mình không có",
    "nghiep-vu",
    () => voi(T, nv1.id, (nc) => suaVaiTro(nc, vaiTroPhongBan.id, { quyen: [{ ma: "finance.approve", phamVi: "all" }] })),
    "chính bạn không có",
  );
  const ghiDoiQuyen = await chu.auditLog.count({ where: { tenantId: T, action: "doi-quyen", objectType: "role" } });
  dat("Đổi quyền vai trò có ghi Audit Log", ghiDoiQuyen > 0);

  // --- 7. Kiểm quyền ở service, không chỉ ở giao diện ---
  await nemLoiKieu("Nhân viên thường gọi thẳng service tạo người dùng bị từ chối", "quyen", () =>
    voi(T, nv2.id, (nc) =>
      taoNguoiDung(nc, { email: email("lau"), hoTen: "Lậu", vaiTroIds: [], matKhauKhoiTao: "Lau-2026-abc", batDoiMatKhau: true }),
    ),
  );

  // --- 8. Mật khẩu ---
  await voi(T, qt.id, (nc) => datLaiMatKhau(nc, nv2.id, "MoiDatLai-2026", true));
  const sauDatLai = await chu.user.findUniqueOrThrow({ where: { id: nv2.id } });
  dat("Đặt lại mật khẩu bật cờ bắt đổi và ghi mốc đổi", sauDatLai.mustChangePassword && Boolean(sauDatLai.passwordChangedAt));
  dat("Mật khẩu lưu dạng băm, khớp mật khẩu mới", await kiemTraMatKhau("MoiDatLai-2026", sauDatLai.passwordHash));
  await nemLoiKieu("Tự đổi mật khẩu với mật khẩu hiện tại sai bị từ chối", "nghiep-vu", () =>
    voi(T, nv2.id, (nc) => doiMatKhauCuaToi(nc, "sai-mat-khau", "MatKhauMoi-2026x")),
  );
  await voi(T, nv2.id, (nc) => doiMatKhauCuaToi(nc, "MoiDatLai-2026", "TuDoi-2026-xyz"));
  const sauTuDoi = await chu.user.findUniqueOrThrow({ where: { id: nv2.id } });
  dat("Tự đổi mật khẩu tắt cờ bắt đổi", !sauTuDoi.mustChangePassword);

  // --- 9. Cấu hình ---
  await voi(T, qt.id, (nc) => capNhatCauHinh(nc, { giaTri: { "bao_gia.nguong_bien_loi_nhuan": 12.5 } }));
  const nguong = await voiTenant(T, (tx) => docCauHinh(tx, "bao_gia.nguong_bien_loi_nhuan"));
  dat("Lưu và đọc lại ngưỡng biên lợi nhuận", nguong === 12.5, String(nguong));
  await nemLoiKieu("Ngưỡng ngoài khoảng 0–100 bị từ chối", "nghiep-vu", () =>
    voi(T, qt.id, (nc) => capNhatCauHinh(nc, { giaTri: { "bao_gia.nguong_bien_loi_nhuan": 150 } })),
  );
  await voi(T, qt.id, (nc) => capNhatCauHinh(nc, { giaTri: { "bao_gia.nguong_bien_loi_nhuan": null } }));
  dat("Xóa ngưỡng về trạng thái chưa cấu hình", (await voiTenant(T, (tx) => docCauHinh(tx, "bao_gia.nguong_bien_loi_nhuan"))) === null);
  const ghiCauHinh = await chu.auditLog.count({ where: { tenantId: T, objectType: "setting" } });
  dat("Đổi cấu hình có ghi Audit Log", ghiCauHinh >= 2, String(ghiCauHinh));
  dat(
    "Cấu hình bảo mật có mặc định khi chưa đặt",
    (await voiTenant(T, (tx) => docCauHinh(tx, "bao_mat.so_lan_sai_toi_da"))) === 5,
  );

  // --- 10. Dữ liệu gốc + cách ly tenant trên bảng mới ---
  const muc = await voi(T, qt.id, (nc) => taoMuc(nc, { loai: "doi_thu", ma: `${DAU}-dt`, ten: "Đối thủ thử", moTa: "", thuTu: 0 }));
  await nemLoiKieu("Mã dữ liệu gốc trùng trong cùng loại bị từ chối", "nghiep-vu", () =>
    voi(T, qt.id, (nc) => taoMuc(nc, { loai: "doi_thu", ma: `${DAU}-dt`, ten: "Trùng", moTa: "", thuTu: 0 })),
  );
  const tenantKhac = await chu.tenant.findFirst({ where: { code: { not: "thu-qt" } }, select: { id: true } });
  if (tenantKhac) {
    const thayTuTenantKhac = await voiTenant(tenantKhac.id, (tx) => tx.masterDataItem.findMany({ where: { id: muc.id } }));
    dat("Tenant khác KHÔNG thấy dữ liệu gốc của tenant thử (RLS trên bảng mới)", thayTuTenantKhac.length === 0);
  }
  const khongNguCanh = await prisma.masterDataItem.findMany({ where: { id: muc.id } });
  dat("Truy vấn bảng mới không có ngữ cảnh tenant trả về 0 dòng", khongNguCanh.length === 0);

  // --- 11. Nhật ký chỉ ghi thêm ---
  await datNemLoi("Không sửa được Audit Log kể cả bằng vai chủ sở hữu", () =>
    chu.auditLog.updateMany({ where: { tenantId: T }, data: { action: "gia-mao" } }),
  );

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử quản trị");
}

main().catch(async (loi) => {
  console.error("Bài thử gặp lỗi ngoài dự kiến:", loi);
  process.exit(1);
});
