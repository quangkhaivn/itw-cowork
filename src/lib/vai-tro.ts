/**
 * Danh mục vai trò và quyền.
 *
 * Vai trò lấy đúng theo mục 19 đặc tả (14 vai trò).
 * Giới hạn của vai trò `ai-assistant` lấy đúng theo mục 17 và mục 30 đặc tả:
 * AI không được xóa dữ liệu, đổi giá, giảm giá vượt quyền, duyệt báo giá,
 * duyệt hợp đồng, chi tiền, sửa KPI, hay gửi khách khi chưa được cấp quyền.
 */

import type { PhamVi } from "./pham-vi";

/** Các phân hệ, đặt theo menu ở mục 22 đặc tả. */
export const PHAN_HE = [
  "dashboard",
  "marketing",
  "crm",
  "sales",
  "quotation",
  "customer",
  "order",
  "project",
  "technical",
  "service_desk",
  "purchasing",
  "inventory",
  "supplier",
  "finance",
  "task",
  "kpi",
  "report",
  "alert",
  "integration",
  "user",
  "role",
  "department",
  "master_data",
  "setting",
  "audit_log",
  "ai",
  // Phase 3 (20/09/2026): sản phẩm, nhóm sản phẩm, thương hiệu, bảng giá nhà cung cấp.
  "product",
  // 0.19.0 — Nhân sự giai đoạn 1: chấm công (lần chấm, đơn từ, bảng công) và hồ sơ / thiết lập nhân sự.
  "cham_cong",
  "nhan_su",
  // 0.20.0 — Nhân sự giai đoạn 2: báo cáo công việc, đánh giá định kỳ, KPI cá nhân, nhật ký + phiếu
  // thực tập. Tách khỏi `kpi` (trợ lý AI có `kpi.view`) để AI không bao giờ đọc được đánh giá (DG-80).
  "danh_gia",
] as const;

// Thêm phân hệ mới: thêm vào CUỐI mảng trên + MO_TA_PHAN_HE, rồi khai quyền cho
// từng vai trò bên dưới. Seed chỉ cấp những mã quyền MỚI xuất hiện cho vai trò
// dựng sẵn, không đè lên chỉnh sửa Giám đốc đã làm trên giao diện.

export type PhanHe = (typeof PHAN_HE)[number];

/** Các hành động. `approve` và `delete` là hai hành động nhạy cảm nhất. */
export const HANH_DONG = ["view", "create", "update", "delete", "approve", "export"] as const;
export type HanhDongQuyen = (typeof HANH_DONG)[number];

export function maQuyen(phanHe: PhanHe, hanhDong: HanhDongQuyen): string {
  return `${phanHe}.${hanhDong}`;
}

/** Sinh toàn bộ danh mục quyền. Dùng khi seed bảng `permissions`. */
export function toanBoQuyen(): { code: string; module: string; action: string; description: string }[] {
  const ds: { code: string; module: string; action: string; description: string }[] = [];
  for (const phanHe of PHAN_HE) {
    for (const hanhDong of HANH_DONG) {
      ds.push({
        code: maQuyen(phanHe, hanhDong),
        module: phanHe,
        action: hanhDong,
        description: `${MO_TA_HANH_DONG[hanhDong]} phân hệ ${MO_TA_PHAN_HE[phanHe]}`,
      });
    }
  }
  return ds;
}

export const MO_TA_PHAN_HE: Record<PhanHe, string> = {
  dashboard: "Bảng điều hành",
  marketing: "Marketing",
  crm: "CRM",
  sales: "Bán hàng",
  quotation: "Báo giá",
  customer: "Khách hàng",
  order: "Đơn hàng",
  project: "Dự án",
  technical: "Kỹ thuật",
  service_desk: "Bàn dịch vụ",
  purchasing: "Mua hàng",
  inventory: "Kho",
  supplier: "Nhà cung cấp",
  finance: "Tài chính",
  task: "Công việc",
  kpi: "KPI",
  report: "Báo cáo",
  alert: "Cảnh báo",
  integration: "Tích hợp",
  user: "Người dùng",
  role: "Vai trò",
  department: "Phòng ban",
  master_data: "Dữ liệu gốc",
  setting: "Cấu hình",
  audit_log: "Nhật ký kiểm toán",
  ai: "Trợ lý AI",
  product: "Sản phẩm",
  cham_cong: "Chấm công",
  nhan_su: "Nhân sự",
  danh_gia: "Đánh giá nhân sự",
};

export const MO_TA_HANH_DONG: Record<HanhDongQuyen, string> = {
  view: "Xem",
  create: "Tạo",
  update: "Sửa",
  delete: "Xóa",
  approve: "Duyệt",
  export: "Xuất dữ liệu",
};

/** Chữ ký gọn: cấp trọn bộ hành động cho một nhóm phân hệ. */
function tron(phanHes: PhanHe[], hanhDongs: HanhDongQuyen[] = [...HANH_DONG]): string[] {
  return phanHes.flatMap((ph) => hanhDongs.map((hd) => maQuyen(ph, hd)));
}

const CHI_XEM: HanhDongQuyen[] = ["view"];
const XEM_XUAT: HanhDongQuyen[] = ["view", "export"];
const LAM_VIEC: HanhDongQuyen[] = ["view", "create", "update", "export"];

export interface DinhNghiaVaiTro {
  code: string;
  name: string;
  description: string;
  /** `"*"` nghĩa là toàn quyền. */
  quyen: string[] | "*";
  /**
   * Phạm vi dữ liệu mặc định cho mọi quyền của vai trò này lúc khởi tạo.
   * Giả định ban đầu, chờ Giám đốc xác nhận; sửa được trên màn hình Vai trò.
   */
  phamVi: PhamVi;
  /**
   * 0.19.0: phạm vi RIÊNG cho vài mã quyền, đè `phamVi` của vai trò. Ví dụ nhân viên mua hàng có phạm
   * vi "all" trên phân hệ của mình nhưng chỉ được xem chấm công CỦA MÌNH (`cham_cong.view` = own).
   */
  phamViRieng?: Record<string, PhamVi>;
}

/** Phạm vi seed cấp cho một mã quyền của vai trò dựng sẵn. */
export function phamViCuaQuyen(dn: DinhNghiaVaiTro, ma: string): PhamVi {
  return dn.phamViRieng?.[ma] ?? dn.phamVi;
}

/**
 * 0.19.0 — chấm công. Mọi nhân viên tự chấm công và xem / gửi đơn của CHÍNH MÌNH (`own`). Trưởng
 * phòng duyệt đơn của nhóm mình (`approve` theo phạm vi vai trò). Nhân sự và Giám đốc: toàn công ty.
 */
const CHAM_CONG_CA_NHAN = [maQuyen("cham_cong", "view"), maQuyen("cham_cong", "create")];
const CHAM_CONG_QUAN_LY = [...CHAM_CONG_CA_NHAN, maQuyen("cham_cong", "approve")];
/**
 * 0.20.0 — đánh giá (QĐ-115). Mọi nhân viên: xem phiếu / báo cáo / nhật ký CỦA MÌNH và tự viết (`own`).
 * Trưởng phòng: xem, chấm, nhận xét, chốt trong phạm vi vai trò. Nhân sự: xem toàn công ty (bộ KPI, kỳ,
 * mẫu phiếu quản lý bằng `nhan_su.update`), không chốt. Giám đốc: toàn quyền. Trợ lý AI: không có.
 */
const DANH_GIA_CA_NHAN = [maQuyen("danh_gia", "view"), maQuyen("danh_gia", "create")];
const DANH_GIA_QUAN_LY = [...DANH_GIA_CA_NHAN, maQuyen("danh_gia", "update"), maQuyen("danh_gia", "approve"), maQuyen("danh_gia", "export")];
function rieng(ds: string[], pv: PhamVi): Record<string, PhamVi> {
  return Object.fromEntries(ds.map((m) => [m, pv]));
}

/**
 * 17 vai trò: 14 của mục 19 đặc tả 12/09 + Thực tập sinh Marketing + (0.19.0) Nhân sự (HR), Thực tập sinh.
 * Bao trùm đủ 10 vai trò ban đầu của master prompt TGTH Business Cowork (19/09):
 * Super Admin → admin, CEO → ceo, Accountant → finance, Technician → technical.
 */
export const VAI_TRO: DinhNghiaVaiTro[] = [
  {
    code: "ceo",
    name: "Giám đốc",
    phamVi: "all",
    description: "Toàn quyền. Người ra quyết định cuối cùng.",
    quyen: "*",
  },
  {
    code: "admin",
    name: "Quản trị hệ thống (Super Admin)",
    phamVi: "all",
    description: "Quản trị người dùng, vai trò, cấu hình, tích hợp.",
    quyen: "*",
  },
  {
    code: "sales-manager",
    name: "Trưởng phòng Kinh doanh",
    phamVi: "team",
    description: "Quản lý đội bán hàng, duyệt báo giá trong hạn mức.",
    quyen: [
      ...tron(["crm", "sales", "quotation", "customer", "order", "task"], LAM_VIEC),
      ...tron(["product"], XEM_XUAT),
      maQuyen("supplier", "view"),
      maQuyen("quotation", "approve"),
      maQuyen("order", "approve"),
      // 20/09: mở lại cơ hội đã đóng (BUSINESS_RULES CH-06). Vai trò đã có trên máy thật được
      // cấp bù bằng migration phase2_crm, vì seed không cấp lại mã quyền cũ (QĐ-10).
      maQuyen("sales", "approve"),
      // 20/09 (Phase 7): theo được tiền về của nhóm mình. Doanh nghiệp đã có trên máy thật
      // được cấp bù bằng migration phase7_tai_chinh (QĐ-10).
      maQuyen("finance", "view"),
      maQuyen("finance", "export"),
      // 0.16.0 (Khách hàng nâng cao): sắp xếp hành trình, gộp khách trùng, bộ lọc dùng chung,
      // tính lại điểm. Doanh nghiệp đã có được cấp bù bằng migration khach_hang_nang_cao (QĐ-37).
      maQuyen("customer", "approve"),
      ...tron(["dashboard", "kpi", "report", "alert", "project"], XEM_XUAT),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_QUAN_LY,
      // 0.20.0: đánh giá — QĐ-115.
      ...DANH_GIA_QUAN_LY,
    ],
  },
  {
    code: "sales",
    name: "Nhân viên Kinh doanh",
    phamVi: "own",
    description: "Chăm sóc lead, tạo báo giá, chốt đơn. Không tự duyệt báo giá của mình.",
    quyen: [
      ...tron(["crm", "sales", "quotation", "customer", "task"], LAM_VIEC),
      ...tron(["product"], XEM_XUAT),
      ...tron(["order", "project", "inventory", "dashboard", "alert", "supplier"], CHI_XEM),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_CA_NHAN,
      ...DANH_GIA_CA_NHAN,
    ],
  },
  {
    code: "marketing-manager",
    name: "Trưởng phòng Marketing",
    phamVi: "all",
    description: "Quản lý chiến dịch, ngân sách marketing, nội dung.",
    quyen: [
      ...tron(["marketing", "task"], LAM_VIEC),
      maQuyen("product", "view"),
      maQuyen("marketing", "approve"),
      ...tron(["crm", "customer", "dashboard", "kpi", "report", "alert"], XEM_XUAT),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_QUAN_LY,
      ...DANH_GIA_QUAN_LY,
    ],
    phamViRieng: { ...rieng(CHAM_CONG_QUAN_LY, "team"), ...rieng(DANH_GIA_QUAN_LY, "team") },
  },
  {
    code: "marketing",
    name: "Nhân viên Marketing",
    phamVi: "all",
    description: "Thực thi chiến dịch và nội dung.",
    quyen: [
      ...tron(["marketing", "task"], LAM_VIEC),
      ...tron(["crm", "dashboard", "alert", "product"], CHI_XEM),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_CA_NHAN,
      ...DANH_GIA_CA_NHAN,
    ],
    phamViRieng: rieng([...CHAM_CONG_CA_NHAN, ...DANH_GIA_CA_NHAN], "own"),
  },
  {
    code: "technical-manager",
    name: "Trưởng phòng Kỹ thuật",
    phamVi: "department",
    description: "Quản lý kỹ thuật viên, phân công, duyệt phiếu dịch vụ.",
    quyen: [
      ...tron(["technical", "service_desk", "project", "task"], LAM_VIEC),
      maQuyen("product", "view"),
      maQuyen("service_desk", "approve"),
      maQuyen("project", "approve"),
      ...tron(["customer", "inventory", "dashboard", "kpi", "report", "alert"], XEM_XUAT),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_QUAN_LY,
      ...DANH_GIA_QUAN_LY,
    ],
  },
  {
    code: "technical",
    name: "Kỹ thuật viên",
    phamVi: "own",
    description: "Xử lý phiếu dịch vụ và công việc triển khai được giao.",
    quyen: [
      ...tron(["technical", "service_desk", "task"], LAM_VIEC),
      ...tron(["customer", "project", "inventory", "dashboard", "alert", "product"], CHI_XEM),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_CA_NHAN,
      ...DANH_GIA_CA_NHAN,
    ],
  },
  {
    code: "project-manager",
    name: "Quản lý Dự án",
    phamVi: "team",
    description: "Điều hành dự án, mốc tiến độ, vật tư, nghiệm thu.",
    quyen: [
      ...tron(["project", "task", "technical"], LAM_VIEC),
      maQuyen("product", "view"),
      maQuyen("project", "approve"),
      ...tron(["customer", "order", "inventory", "purchasing", "dashboard", "kpi", "report", "alert"], XEM_XUAT),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_QUAN_LY,
      ...DANH_GIA_QUAN_LY,
    ],
  },
  {
    code: "purchasing",
    name: "Mua hàng",
    phamVi: "all",
    description: "Yêu cầu mua, đơn mua, làm việc với nhà cung cấp.",
    quyen: [
      ...tron(["purchasing", "supplier", "product", "task"], LAM_VIEC),
      ...tron(["inventory", "order", "project", "dashboard", "alert"], CHI_XEM),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_CA_NHAN,
      ...DANH_GIA_CA_NHAN,
    ],
    phamViRieng: rieng([...CHAM_CONG_CA_NHAN, ...DANH_GIA_CA_NHAN], "own"),
  },
  {
    code: "warehouse",
    name: "Kho",
    phamVi: "all",
    description: "Nhập kho, xuất kho, kiểm tồn, số sê-ri.",
    quyen: [
      ...tron(["inventory", "task"], LAM_VIEC),
      ...tron(["product"], XEM_XUAT),
      ...tron(["order", "purchasing", "project", "dashboard", "alert", "supplier"], CHI_XEM),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_CA_NHAN,
      ...DANH_GIA_CA_NHAN,
    ],
    phamViRieng: rieng([...CHAM_CONG_CA_NHAN, ...DANH_GIA_CA_NHAN], "own"),
  },
  {
    code: "finance",
    name: "Kế toán – Tài chính",
    phamVi: "all",
    description: "Công nợ, thu chi, hóa đơn, dòng tiền.",
    quyen: [
      ...tron(["finance", "task"], LAM_VIEC),
      ...tron(["product"], XEM_XUAT),
      maQuyen("supplier", "view"),
      maQuyen("finance", "approve"),
      // 21/09 (Mua hàng): duyệt đề nghị mua — duyệt chi tiền là việc của tài chính.
      // Doanh nghiệp đã có trên máy thật được cấp bù bằng migration mua_hang (QĐ-10).
      maQuyen("purchasing", "approve"),
      ...tron(["order", "project", "customer", "purchasing", "dashboard", "kpi", "report", "alert"], XEM_XUAT),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_CA_NHAN,
      ...DANH_GIA_CA_NHAN,
    ],
    phamViRieng: rieng([...CHAM_CONG_CA_NHAN, ...DANH_GIA_CA_NHAN], "own"),
  },
  {
    code: "customer-service",
    name: "Chăm sóc khách hàng",
    phamVi: "all",
    description: "Tiếp nhận yêu cầu, bảo hành, khiếu nại, chăm sóc lại.",
    quyen: [
      ...tron(["service_desk", "customer", "crm", "task"], LAM_VIEC),
      ...tron(["order", "project", "dashboard", "alert", "product"], CHI_XEM),
      maQuyen("ai", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_CA_NHAN,
      ...DANH_GIA_CA_NHAN,
    ],
    phamViRieng: rieng([...CHAM_CONG_CA_NHAN, ...DANH_GIA_CA_NHAN], "own"),
  },
  {
    code: "marketing-intern",
    name: "Thực tập sinh Marketing",
    phamVi: "own",
    description:
      "Chỉ xem và soạn nội dung. Bị che số điện thoại và email của lead (Phụ lục A mục 10 đặc tả Marketing — giả định chờ Giám đốc xác nhận).",
    quyen: [
      maQuyen("marketing", "view"),
      maQuyen("marketing", "create"),
      maQuyen("task", "view"),
      maQuyen("task", "update"),
      maQuyen("dashboard", "view"),
      // 0.19.0: chấm công — QĐ-107.
      ...CHAM_CONG_CA_NHAN,
      ...DANH_GIA_CA_NHAN,
    ],
  },
  {
    // 0.19.0 — Nhân sự giai đoạn 1 (BUSINESS_RULES mục 30). Toàn công ty với chấm công / nhân sự;
    // mã "nhan-su-hr" (không phải "nhan-su") để không chiếm vai trò tùy biến doanh nghiệp đã tự đặt tên đó.
    // công việc chỉ của mình. Không có quyền khách hàng, giá, tài chính.
    code: "nhan-su-hr",
    name: "Nhân sự (HR)",
    phamVi: "all",
    description: "Hồ sơ nhân sự, ca làm, máy chấm công, duyệt nghỉ phép / tăng ca, bảng công tháng.",
    quyen: [
      ...tron(["cham_cong"], ["view", "create", "update", "approve", "export"]),
      ...tron(["nhan_su"], ["view", "create", "update", "export"]),
      maQuyen("user", "view"),
      maQuyen("department", "view"),
      ...tron(["task"], LAM_VIEC),
      ...tron(["dashboard", "alert"], CHI_XEM),
      // 0.20.0: xem / xuất đánh giá toàn công ty; bộ KPI, kỳ, mẫu phiếu thực tập qua `nhan_su.update`.
      maQuyen("danh_gia", "view"),
      maQuyen("danh_gia", "create"),
      maQuyen("danh_gia", "export"),
    ],
    phamViRieng: { ...rieng(tron(["task"], LAM_VIEC), "own"), [maQuyen("danh_gia", "create")]: "own" },
  },
  {
    // 0.19.0 — sinh viên thực tập (owner 01/11/2026). Chỉ công việc của mình + chấm công của mình;
    // KHÔNG thấy khách hàng, giá, đơn hàng. Phiếu đánh giá thực tập là giai đoạn 2.
    code: "sinh-vien-thuc-tap",
    name: "Thực tập sinh",
    phamVi: "own",
    description: "Sinh viên thực tập: chỉ xem / cập nhật công việc được giao và chấm công của chính mình.",
    quyen: [maQuyen("task", "view"), maQuyen("task", "update"), ...CHAM_CONG_CA_NHAN, ...DANH_GIA_CA_NHAN],
  },
  {
    code: "ai-assistant",
    name: "ITA — Trợ lý AI",
    phamVi: "all",
    description:
      "Đọc dữ liệu, phân tích, gợi ý, soạn nháp. Mục 17 và 30 cấm: xóa dữ liệu, đổi giá, giảm giá vượt quyền, duyệt báo giá, duyệt hợp đồng, chi tiền, sửa KPI, gửi khách khi chưa được cấp quyền.",
    quyen: [
      // Đọc rộng để phân tích được.
      ...tron(
        [
          "dashboard", "marketing", "crm", "sales", "quotation", "customer", "order",
          "project", "technical", "service_desk", "purchasing", "inventory", "supplier",
          "finance", "task", "kpi", "report", "alert", "product",
        ],
        CHI_XEM,
      ),
      // Chỉ được tạo bản nháp gợi ý của chính mình.
      maQuyen("ai", "view"),
      maQuyen("ai", "create"),
      maQuyen("ai", "update"),
      // Cố ý KHÔNG cấp: mọi `*.approve`, mọi `*.delete`, `finance.create`,
      // `finance.update`, `quotation.update`, `kpi.update`, `*.export`.
    ],
  },
];

/** Kiểm tra bất biến: vai trò AI không bao giờ được cầm quyền duyệt hoặc xóa. */
export function kiemTraGioiHanAI(): { dat: boolean; viPham: string[] } {
  const ai = VAI_TRO.find((v) => v.code === "ai-assistant");
  if (!ai || ai.quyen === "*") return { dat: false, viPham: ["Vai trò AI đang có toàn quyền"] };
  // 0.20.0 (DG-80): AI không có bất kỳ quyền đánh giá nhân sự nào.
  const viPham = ai.quyen.filter((q) => q.endsWith(".approve") || q.endsWith(".delete") || q.startsWith("danh_gia."));
  return { dat: viPham.length === 0, viPham };
}
