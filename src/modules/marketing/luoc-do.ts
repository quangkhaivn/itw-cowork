import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";
import {
  DS_KHOA_TRUONG_FORM,
  KENH_MARKETING,
  LOAI_CHI_PHI,
  TRANG_THAI_CHIEN_DICH,
  TRUONG_FORM,
  type KhoaTruongForm,
} from "./hang-so";
import { coKyTuDieuKhien, laSlugHopLe } from "./tinh-toan";

/** Lược đồ phân hệ Marketing. Luật MK-01 → MK-16 ở BUSINESS_RULES.md mục 21. */

const emailTuyChon = z
  .union([z.email("Email không hợp lệ.").max(255), z.literal(""), z.null()])
  .transform((s) => (s ? s.trim() : null))
  .optional();

const slugTuyChon = z
  .union([z.string().trim().max(60), z.null()])
  .optional()
  .refine((s) => !s || laSlugHopLe(s), "Chỉ dùng chữ thường không dấu, số và dấu gạch nối (ví dụ: camera-tet-2027).");

const utmTuyChon = z
  .union([z.string().trim().max(120), z.null()])
  .optional()
  .transform((s) => (s ? s : null));

// ---------------------------------------------------------------------------
// Chiến dịch
// ---------------------------------------------------------------------------

const coSoChienDich = z.object({
  ten: z.string().trim().min(3, "Tên chiến dịch tối thiểu 3 ký tự.").max(255),
  kenh: z.enum(KENH_MARKETING, "Chọn kênh."),
  utmCampaign: utmTuyChon,
  ngayBatDau: ngayTuyChon,
  ngayKetThuc: ngayTuyChon,
  nganSach: soTien.optional().default("0"),
  mucTieuLead: z.union([z.coerce.number().int().min(0).max(1_000_000), z.literal(""), z.null()]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  nguoiPhuTrachId: uuidTuyChon,
  ghiChu: chuoiTuyChon(5000),
});

export const LuocDoTaoChienDich = coSoChienDich.refine(
  (d) => !d.ngayBatDau || !d.ngayKetThuc || d.ngayKetThuc >= d.ngayBatDau,
  { message: "Ngày kết thúc phải sau ngày bắt đầu.", path: ["ngayKetThuc"] },
);
export type DuLieuChienDich = z.infer<typeof LuocDoTaoChienDich>;

export const LuocDoSuaChienDich = coSoChienDich.partial().refine(
  (d) => !d.ngayBatDau || !d.ngayKetThuc || d.ngayKetThuc >= d.ngayBatDau,
  { message: "Ngày kết thúc phải sau ngày bắt đầu.", path: ["ngayKetThuc"] },
);
export type DuLieuSuaChienDich = z.infer<typeof LuocDoSuaChienDich>;

export const LuocDoDoiTrangThaiChienDich = z.object({
  trangThai: z.enum(TRANG_THAI_CHIEN_DICH),
  lyDo: chuoiTuyChon(2000),
});

export const LuocDoDuyetNganSach = z.object({
  dongY: z.boolean(),
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoLocChienDich = z.object({
  q: z.string().trim().max(100).optional().default(""),
  trangThai: z.union([z.enum(TRANG_THAI_CHIEN_DICH), z.literal("")]).optional().default(""),
  kenh: z.union([z.enum(KENH_MARKETING), z.literal("")]).optional().default(""),
  tuNgay: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional().default(""),
  denNgay: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional().default(""),
});
export type BoLocChienDich = z.infer<typeof LuocDoLocChienDich>;

export const LuocDoChiPhi = z.object({
  ngay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Chọn ngày chi."),
  soTien: soTien.refine((s) => Number(s) > 0, "Số tiền phải lớn hơn 0."),
  loai: z.enum(LOAI_CHI_PHI).optional().default("quang-cao"),
  ghiChu: chuoiTuyChon(2000),
});
export type DuLieuChiPhi = z.infer<typeof LuocDoChiPhi>;

export const LuocDoHuyChiPhi = z.object({
  lyDo: z.string().trim().min(3, "Ghi lý do hủy khoản chi (tối thiểu 3 ký tự).").max(2000),
});

// ---------------------------------------------------------------------------
// Nhận lead
// ---------------------------------------------------------------------------

export const LuocDoDanhSachNhanLead = z.object({
  nguoiIds: z.array(z.uuid()).max(100, "Tối đa 100 người."),
});

/** Nhập tay một lead ở màn hình Marketing (hội thảo, danh thiếp…) — vẫn đi qua `nhanLead()`. */
export const LuocDoNhapTayLead = z.object({
  hoTen: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự.").max(255),
  dienThoai: chuoiTuyChon(30),
  email: emailTuyChon,
  congTy: chuoiTuyChon(255),
  chucDanh: chuoiTuyChon(255),
  maSoThue: chuoiTuyChon(30),
  nhuCau: chuoiTuyChon(3000),
  ghiChu: chuoiTuyChon(3000),
  chienDichId: uuidTuyChon,
  nguon: chuoiTuyChon(50),
  /** Chỉ tích khi chính người đó đã đồng ý (ví dụ ký vào phiếu đăng ký) — MK-13. */
  dongYNhanTin: z.boolean().optional().default(false),
});
export type DuLieuNhapTayLead = z.infer<typeof LuocDoNhapTayLead>;

// ---------------------------------------------------------------------------
// Form đăng ký
// ---------------------------------------------------------------------------

const truongForm = z.object({
  khoa: z.enum(DS_KHOA_TRUONG_FORM as [KhoaTruongForm, ...KhoaTruongForm[]], "Trường không có trong danh mục cho phép."),
  nhan: z.string().trim().max(100).optional().default(""),
  batBuoc: z.boolean().optional().default(false),
});

export const LuocDoForm = z
  .object({
    ten: z.string().trim().min(3, "Tên form tối thiểu 3 ký tự.").max(255),
    slug: slugTuyChon,
    tieuDe: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự.").max(255),
    gioiThieu: chuoiTuyChon(2000),
    truong: z.array(truongForm).min(1, "Form cần ít nhất một trường.").max(DS_KHOA_TRUONG_FORM.length),
    nutGui: chuoiTuyChon(60),
    loiCamOn: chuoiTuyChon(1000),
    cauDongY: chuoiTuyChon(1000),
    chienDichId: uuidTuyChon,
    nguon: chuoiTuyChon(50),
    trangThai: z.enum(["hoat-dong", "tat"]).optional().default("hoat-dong"),
  })
  .transform((d) => ({
    ...d,
    truong: d.truong.map((t) => ({ ...t, nhan: t.nhan || TRUONG_FORM[t.khoa].nhan })),
  }))
  .superRefine((d, ctx) => {
    const khoa = d.truong.map((t) => t.khoa);
    if (new Set(khoa).size !== khoa.length) ctx.addIssue({ code: "custom", message: "Một trường bị chọn hai lần.", path: ["truong"] });
    if (!khoa.includes("hoTen") && !khoa.includes("congTy")) ctx.addIssue({ code: "custom", message: "Form cần trường Họ tên hoặc Công ty.", path: ["truong"] });
    if (!khoa.includes("dienThoai") && !khoa.includes("email")) ctx.addIssue({ code: "custom", message: "Form cần trường Số điện thoại hoặc Email (LD-02).", path: ["truong"] });
  });
export type DuLieuForm = z.infer<typeof LuocDoForm>;

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export const LuocDoNguonWebhook = z.object({
  ten: z.string().trim().min(3, "Tên nguồn tối thiểu 3 ký tự.").max(255),
  ma: slugTuyChon,
  chienDichId: uuidTuyChon,
  nguon: chuoiTuyChon(50),
});
export type DuLieuNguonWebhook = z.infer<typeof LuocDoNguonWebhook>;

/**
 * Thân yêu cầu webhook. Nhận cả tên trường tiếng Việt lẫn tên thông dụng của các công cụ
 * nối (Zapier, Make): full_name, phone_number… Trường lạ bị bỏ, không lỗi.
 */
export const LuocDoThanWebhook = z
  .object({
    hoTen: z.string().max(255).optional(),
    full_name: z.string().max(255).optional(),
    name: z.string().max(255).optional(),
    dienThoai: z.string().max(30).optional(),
    phone_number: z.string().max(30).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().max(255).optional(),
    congTy: z.string().max(255).optional(),
    company_name: z.string().max(255).optional(),
    chucDanh: z.string().max(255).optional(),
    job_title: z.string().max(255).optional(),
    maSoThue: z.string().max(30).optional(),
    nhuCau: z.string().max(3000).optional(),
    message: z.string().max(3000).optional(),
    ghiChu: z.string().max(3000).optional(),
    dongYNhanTin: z.boolean().optional(),
    utm_source: z.string().max(500).optional(),
    utm_medium: z.string().max(500).optional(),
    utm_campaign: z.string().max(500).optional(),
    utm_content: z.string().max(500).optional(),
    utm_term: z.string().max(500).optional(),
  })
  .transform((d) => ({
    hoTen: (d.hoTen ?? d.full_name ?? d.name ?? "").trim(),
    dienThoai: (d.dienThoai ?? d.phone_number ?? d.phone ?? "").trim(),
    email: (d.email ?? "").trim(),
    congTy: (d.congTy ?? d.company_name ?? "").trim(),
    chucDanh: (d.chucDanh ?? d.job_title ?? "").trim(),
    maSoThue: (d.maSoThue ?? "").trim(),
    nhuCau: (d.nhuCau ?? d.message ?? "").trim(),
    ghiChu: (d.ghiChu ?? "").trim(),
    dongYNhanTin: d.dongYNhanTin === true,
    utm: { utm_source: d.utm_source, utm_medium: d.utm_medium, utm_campaign: d.utm_campaign, utm_content: d.utm_content, utm_term: d.utm_term },
  }));

// ---------------------------------------------------------------------------
// Phân khúc (MK-14) — điều kiện theo danh mục trường cho phép, không nhận biểu thức tự do
// ---------------------------------------------------------------------------

const chuSach = (s: string) => !coKyTuDieuKhien(s);
const maDs = z.array(z.string().trim().min(1).max(50).refine(chuSach, "Có ký tự không hợp lệ.")).max(50).optional().default([]);
const ngayLoc = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional().default("");
const coKhong = z.enum(["", "co", "khong"]).optional().default("");

export const LuocDoDieuKienLead = z
  .object({
    nguon: maDs,
    chienDichIds: z.array(z.uuid()).max(50).optional().default([]),
    giaiDoan: z.array(z.enum(["NEW_LEAD", "CONTACTED", "QUALIFIED", "DISQUALIFIED", "CONVERTED"])).max(5).optional().default([]),
    kenhNhan: z.array(z.enum(["form", "landing", "webhook", "nhap-tay"])).max(4).optional().default([]),
    utmSource: z.string().trim().max(120).refine(chuSach, "Có ký tự không hợp lệ.").optional().default(""),
    taoTuNgay: ngayLoc,
    taoDenNgay: ngayLoc,
    coEmail: coKhong,
    coDienThoai: coKhong,
    dongYNhanTin: coKhong,
  })
  .strict();

export const LuocDoDieuKienLienHe = z
  .object({
    nguon: maDs,
    chienDichIds: z.array(z.uuid()).max(50).optional().default([]),
    phanKhuc: maDs,
    nganh: maDs,
    loaiKhach: maDs,
    trangThaiKhach: z.array(z.enum(["tiem-nang", "dang-giao-dich", "ngung-giao-dich"])).max(3).optional().default([]),
    tinhThanh: z.array(z.string().trim().min(1).max(100).refine(chuSach, "Có ký tự không hợp lệ.")).max(70).optional().default([]),
    coEmail: coKhong,
    coDienThoai: coKhong,
    dongYNhanTin: coKhong,
  })
  .strict();

export type DieuKienLead = z.infer<typeof LuocDoDieuKienLead>;
export type DieuKienLienHe = z.infer<typeof LuocDoDieuKienLienHe>;

export const LuocDoPhanKhuc = z.discriminatedUnion("doiTuong", [
  z.object({ doiTuong: z.literal("lead"), dieuKien: LuocDoDieuKienLead }),
  z.object({ doiTuong: z.literal("lien-he"), dieuKien: LuocDoDieuKienLienHe }),
]);
export type PhanKhucDieuKien = z.infer<typeof LuocDoPhanKhuc>;

export const LuocDoLuuPhanKhuc = z.object({
  ten: z.string().trim().min(3, "Tên phân khúc tối thiểu 3 ký tự.").max(255).refine(chuSach, "Có ký tự không hợp lệ."),
  ghiChu: chuoiTuyChon(2000).refine((s) => !s || chuSach(s), "Có ký tự không hợp lệ."),
  phanKhuc: LuocDoPhanKhuc,
});

export const LuocDoDongYNhanTin = z.object({
  dongY: z.boolean(),
  nguon: z.string().trim().min(2, "Ghi rõ khách đồng ý / từ chối qua đâu (ví dụ: gọi điện ngày 12/10).").max(100),
});
