/**
 * Danh mục vai trò và quyền.
 *
 * Vai trò lấy đúng theo mục 19 đặc tả (14 vai trò).
 * Giới hạn của vai trò `ai-assistant` lấy đúng theo mục 17 và mục 30 đặc tả:
 * AI không được xóa dữ liệu, đổi giá, giảm giá vượt quyền, duyệt báo giá,
 * duyệt hợp đồng, chi tiền, sửa KPI, hay gửi khách khi chưa được cấp quyền.
 */

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
  "setting",
  "audit_log",
  "ai",
] as const;

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

const MO_TA_PHAN_HE: Record<PhanHe, string> = {
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
  setting: "Cấu hình",
  audit_log: "Nhật ký kiểm toán",
  ai: "Trợ lý AI",
};

const MO_TA_HANH_DONG: Record<HanhDongQuyen, string> = {
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
}

/** 14 vai trò theo mục 19 đặc tả. */
export const VAI_TRO: DinhNghiaVaiTro[] = [
  {
    code: "ceo",
    name: "Giám đốc",
    description: "Toàn quyền. Người ra quyết định cuối cùng.",
    quyen: "*",
  },
  {
    code: "admin",
    name: "Quản trị hệ thống",
    description: "Quản trị người dùng, vai trò, cấu hình, tích hợp.",
    quyen: "*",
  },
  {
    code: "sales-manager",
    name: "Trưởng phòng Kinh doanh",
    description: "Quản lý đội bán hàng, duyệt báo giá trong hạn mức.",
    quyen: [
      ...tron(["crm", "sales", "quotation", "customer", "order", "task"], LAM_VIEC),
      maQuyen("quotation", "approve"),
      maQuyen("order", "approve"),
      ...tron(["dashboard", "kpi", "report", "alert", "project"], XEM_XUAT),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "sales",
    name: "Nhân viên Kinh doanh",
    description: "Chăm sóc lead, tạo báo giá, chốt đơn. Không tự duyệt báo giá của mình.",
    quyen: [
      ...tron(["crm", "sales", "quotation", "customer", "task"], LAM_VIEC),
      ...tron(["order", "project", "inventory", "dashboard", "alert"], CHI_XEM),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "marketing-manager",
    name: "Trưởng phòng Marketing",
    description: "Quản lý chiến dịch, ngân sách marketing, nội dung.",
    quyen: [
      ...tron(["marketing", "task"], LAM_VIEC),
      maQuyen("marketing", "approve"),
      ...tron(["crm", "customer", "dashboard", "kpi", "report", "alert"], XEM_XUAT),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "marketing",
    name: "Nhân viên Marketing",
    description: "Thực thi chiến dịch và nội dung.",
    quyen: [
      ...tron(["marketing", "task"], LAM_VIEC),
      ...tron(["crm", "dashboard", "alert"], CHI_XEM),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "technical-manager",
    name: "Trưởng phòng Kỹ thuật",
    description: "Quản lý kỹ thuật viên, phân công, duyệt phiếu dịch vụ.",
    quyen: [
      ...tron(["technical", "service_desk", "project", "task"], LAM_VIEC),
      maQuyen("service_desk", "approve"),
      maQuyen("project", "approve"),
      ...tron(["customer", "inventory", "dashboard", "kpi", "report", "alert"], XEM_XUAT),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "technical",
    name: "Kỹ thuật viên",
    description: "Xử lý phiếu dịch vụ và công việc triển khai được giao.",
    quyen: [
      ...tron(["technical", "service_desk", "task"], LAM_VIEC),
      ...tron(["customer", "project", "inventory", "dashboard", "alert"], CHI_XEM),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "project-manager",
    name: "Quản lý Dự án",
    description: "Điều hành dự án, mốc tiến độ, vật tư, nghiệm thu.",
    quyen: [
      ...tron(["project", "task", "technical"], LAM_VIEC),
      maQuyen("project", "approve"),
      ...tron(["customer", "order", "inventory", "purchasing", "dashboard", "kpi", "report", "alert"], XEM_XUAT),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "purchasing",
    name: "Mua hàng",
    description: "Yêu cầu mua, đơn mua, làm việc với nhà cung cấp.",
    quyen: [
      ...tron(["purchasing", "supplier", "task"], LAM_VIEC),
      ...tron(["inventory", "order", "project", "dashboard", "alert"], CHI_XEM),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "warehouse",
    name: "Kho",
    description: "Nhập kho, xuất kho, kiểm tồn, số sê-ri.",
    quyen: [
      ...tron(["inventory", "task"], LAM_VIEC),
      ...tron(["order", "purchasing", "project", "dashboard", "alert"], CHI_XEM),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "finance",
    name: "Tài chính",
    description: "Công nợ, thu chi, hóa đơn, dòng tiền.",
    quyen: [
      ...tron(["finance", "task"], LAM_VIEC),
      maQuyen("finance", "approve"),
      ...tron(["order", "project", "customer", "purchasing", "dashboard", "kpi", "report", "alert"], XEM_XUAT),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "customer-service",
    name: "Chăm sóc khách hàng",
    description: "Tiếp nhận yêu cầu, bảo hành, khiếu nại, chăm sóc lại.",
    quyen: [
      ...tron(["service_desk", "customer", "crm", "task"], LAM_VIEC),
      ...tron(["order", "project", "dashboard", "alert"], CHI_XEM),
      maQuyen("ai", "view"),
    ],
  },
  {
    code: "marketing-intern",
    name: "Thực tập sinh Marketing",
    description:
      "Chỉ xem và soạn nội dung. Bị che số điện thoại và email của lead (Phụ lục A mục 10 đặc tả Marketing — giả định chờ Giám đốc xác nhận).",
    quyen: [
      maQuyen("marketing", "view"),
      maQuyen("marketing", "create"),
      maQuyen("task", "view"),
      maQuyen("task", "update"),
      maQuyen("dashboard", "view"),
    ],
  },
  {
    code: "ai-assistant",
    name: "ITA — Trợ lý AI",
    description:
      "Đọc dữ liệu, phân tích, gợi ý, soạn nháp. Mục 17 và 30 cấm: xóa dữ liệu, đổi giá, giảm giá vượt quyền, duyệt báo giá, duyệt hợp đồng, chi tiền, sửa KPI, gửi khách khi chưa được cấp quyền.",
    quyen: [
      // Đọc rộng để phân tích được.
      ...tron(
        [
          "dashboard", "marketing", "crm", "sales", "quotation", "customer", "order",
          "project", "technical", "service_desk", "purchasing", "inventory", "supplier",
          "finance", "task", "kpi", "report", "alert",
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
  const viPham = ai.quyen.filter((q) => q.endsWith(".approve") || q.endsWith(".delete"));
  return { dat: viPham.length === 0, viPham };
}
