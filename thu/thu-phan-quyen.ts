import { prisma, voiTenant } from "../src/lib/db";
import { batBuocQuyen, coQuyen, ghiTuChoiQuyen, layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { kiemTraGioiHanAI, VAI_TRO } from "../src/lib/vai-tro";
import { clientChuSoHuu, dat, datNemLoi, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng RBAC (mục 19) và các điều cấm với trợ lý AI (mục 17, 30).
 *
 * Chạy: npm run thu:phan-quyen
 */

const chu = clientChuSoHuu();

async function main() {
  console.log("=== Thử phân quyền ===\n");

  // --- 1. Bất biến ở tầng định nghĩa: AI không được có quyền duyệt hay xóa ---
  const gioiHanAI = kiemTraGioiHanAI();
  dat("Vai trò AI không cầm quyền .approve hay .delete", gioiHanAI.dat, gioiHanAI.viPham.join(", "));
  // 14 vai trò của mục 19 đặc tả Business OS, cộng "Thực tập sinh Marketing"
  // lấy từ mục 6.1 đặc tả Marketing v1.1 — vai trò này có ràng buộc riêng
  // (che số điện thoại và email của lead), nên tách thành vai trò thứ 15.
  dat("Đủ 15 vai trò (14 của mục 19 + Thực tập sinh Marketing)", VAI_TRO.length === 15, `đang có ${VAI_TRO.length}`);
  const maVaiTro = VAI_TRO.map((v) => v.code);
  const thieu = [
    "ceo", "admin", "sales-manager", "sales", "marketing-manager", "marketing",
    "technical-manager", "technical", "project-manager", "purchasing",
    "warehouse", "finance", "customer-service", "ai-assistant",
  ].filter((m) => !maVaiTro.includes(m));
  dat("Có đủ 14 vai trò mục 19 yêu cầu", thieu.length === 0, `thiếu: ${thieu.join(", ")}`);

  const tenant = await chu.tenant.findUnique({ where: { code: "itw" } });
  if (!tenant) {
    console.log("  ❌ HỎNG: chưa seed tenant 'itw'. Chạy `npm run db:seed` trước.");
    process.exit(1);
  }

  // --- 2. Kiểm tra quyền thật trong cơ sở dữ liệu của vai trò AI ---
  const vaiTroAI = await chu.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: "ai-assistant" } },
    select: { rolePermissions: { select: { permission: { select: { code: true } } } } },
  });
  const quyenAI = vaiTroAI.rolePermissions.map((rp) => rp.permission.code);
  const viPhamTrongDb = quyenAI.filter((q) => q.endsWith(".approve") || q.endsWith(".delete"));
  dat("Trong cơ sở dữ liệu, vai trò AI cũng không có .approve/.delete", viPhamTrongDb.length === 0, viPhamTrongDb.join(", "));
  dat("Vai trò AI vẫn đọc được dữ liệu để phân tích", quyenAI.includes("finance.view"));
  dat("Vai trò AI KHÔNG được sửa tài chính", !quyenAI.includes("finance.update"));
  dat("Vai trò AI KHÔNG được sửa KPI", !quyenAI.includes("kpi.update"));

  // --- 3. Dựng một người dùng thử với vai trò thực tập sinh ---
  const EMAIL_THU = "thu-thuc-tap@thu.test";
  await chu.user.deleteMany({ where: { tenantId: tenant.id, email: EMAIL_THU } });

  const vaiTroTts = await chu.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: "marketing-intern" } },
  });
  const nguoiThu = await chu.user.create({
    data: {
      tenantId: tenant.id,
      email: EMAIL_THU,
      passwordHash: "x",
      fullName: "Thực tập sinh (bài thử)",
      userRoles: { create: { tenantId: tenant.id, roleId: vaiTroTts.id } },
    },
  });

  await voiTenant(tenant.id, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, nguoiThu.id);
    if (!hoSo) {
      dat("Đọc được hồ sơ quyền của người thử", false);
      return;
    }
    dat("Đọc được hồ sơ quyền của người thử", true);
    dat("Thực tập sinh có quyền xem Marketing", coQuyen(hoSo, "marketing.view"));
    dat("Thực tập sinh KHÔNG có quyền duyệt tài chính", !coQuyen(hoSo, "finance.approve"));
    dat("Thực tập sinh KHÔNG có quyền xóa khách hàng", !coQuyen(hoSo, "customer.delete"));
    dat("Thực tập sinh KHÔNG có quyền xuất dữ liệu", !coQuyen(hoSo, "customer.export"));
  });

  // --- 4. batBuocQuyen phải ném lỗi khi thiếu quyền ---
  await datNemLoi("batBuocQuyen ném lỗi khi thực tập sinh đòi duyệt tài chính", () =>
    voiTenant(tenant.id, async (tx) => {
      const hoSo = await layHoSoQuyen(tx, nguoiThu.id);
      batBuocQuyen(hoSo!, "finance.approve", { objectType: "bai-thu" });
    }),
  );

  // --- 5. Mỗi lần từ chối quyền phải để lại vết ---
  //     Đi đúng đường của lớp bọc API (src/lib/api.ts): giao dịch chính cuộn ngược,
  //     rồi ghi vết trong một giao dịch RIÊNG. Từ 19/09 batBuocQuyen không tự ghi vết
  //     nữa, chính vì bản cũ ghi trong giao dịch bị cuộn ngược nên mất vết.
  let loiBat: LoiThieuQuyen | null = null;
  await voiTenant(tenant.id, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, nguoiThu.id);
    batBuocQuyen(hoSo!, "finance.approve", { objectType: "bai-thu" });
  }).catch((e) => {
    loiBat = e instanceof LoiThieuQuyen ? e : null;
  });
  dat("Lỗi ném ra đúng kiểu LoiThieuQuyen, mang mã quyền thiếu", loiBat !== null && (loiBat as LoiThieuQuyen).maQuyen === "finance.approve");
  if (loiBat) {
    await voiTenant(tenant.id, (tx) =>
      ghiTuChoiQuyen(tx, { userId: nguoiThu.id, email: EMAIL_THU }, loiBat as unknown as LoiThieuQuyen),
    );
  }
  const soVetTuChoi = await chu.auditLog.count({
    where: { tenantId: tenant.id, action: "tu-choi-quyen", actorId: nguoiThu.id },
  });
  dat("Lần từ chối quyền có ghi vào Audit Log", soVetTuChoi > 0, `đếm được ${soVetTuChoi}`);

  const soSuKienTuChoi = await chu.businessEvent.count({
    where: { tenantId: tenant.id, eventType: "PERMISSION_DENIED", actorId: nguoiThu.id },
  });
  dat("Lần từ chối quyền có ghi Business Event", soSuKienTuChoi > 0, `đếm được ${soSuKienTuChoi}`);

  // --- 6. Giám đốc có toàn quyền ---
  const ceo = await chu.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: "ceo" } },
    select: { _count: { select: { rolePermissions: true } } },
  });
  const tongQuyen = await chu.permission.count();
  dat("Vai trò Giám đốc có toàn bộ quyền", ceo._count.rolePermissions === tongQuyen, `${ceo._count.rolePermissions}/${tongQuyen}`);

  // Dọn dẹp.
  await chu.user.deleteMany({ where: { tenantId: tenant.id, email: EMAIL_THU } });
  await chu.$disconnect();
  await prisma.$disconnect();

  ketLuan("Thử phân quyền");
}

main().catch(async (loi) => {
  console.error("Bài thử gặp lỗi ngoài dự kiến:", loi);
  await chu.user.deleteMany({ where: { email: "thu-thuc-tap@thu.test" } }).catch(() => {});
  process.exit(1);
});
