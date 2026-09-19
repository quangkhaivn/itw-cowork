import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";

/** Lược đồ phân hệ Lead. Luật LD-01 → LD-07 ở BUSINESS_RULES.md. */

const emailTuyChon = z
  .union([z.email("Email không hợp lệ.").max(255), z.literal(""), z.null()])
  .transform((s) => (s ? s.trim() : null))
  .optional();

export const LuocDoTaoLead = z.object({
  hoTen: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự.").max(255),
  congTy: chuoiTuyChon(255),
  chucDanh: chuoiTuyChon(255),
  dienThoai: chuoiTuyChon(30),
  email: emailTuyChon,
  maSoThue: chuoiTuyChon(30),
  nguon: chuoiTuyChon(50),
  nhuCau: chuoiTuyChon(5000),
  giaTriUocTinh: soTien.optional().nullable(),
  nguoiPhuTrachId: uuidTuyChon,
  ghiChu: chuoiTuyChon(5000),
  xacNhanKhongTrung: z.boolean().optional().default(false),
});
export type DuLieuTaoLead = z.infer<typeof LuocDoTaoLead>;

export const LuocDoSuaLead = LuocDoTaoLead.omit({ xacNhanKhongTrung: true })
  .partial()
  .extend({
    hoTen: z.string().trim().min(2).max(255).optional(),
    /** Chỉ đổi qua lại giữa các giai đoạn đang mở; loại và chuyển đổi có thao tác riêng. */
    giaiDoan: z.enum(["NEW_LEAD", "CONTACTED", "QUALIFIED"]).optional(),
    xacNhanKhongTrung: z.boolean().optional().default(false),
  });
export type DuLieuSuaLead = z.infer<typeof LuocDoSuaLead>;

export const LuocDoLoaiLead = z.object({
  lyDo: z.string().trim().min(3, "Ghi lý do loại lead (tối thiểu 3 ký tự).").max(2000),
});

/** Chuyển đổi lead (LD-05): khách mới HOẶC khách đã có; liên hệ; cơ hội tùy chọn. */
export const LuocDoChuyenDoiLead = z
  .object({
    /** Gắn vào khách đã có. Bỏ trống = tạo khách mới từ thông tin lead. */
    khachHangId: uuidTuyChon,
    khachMoi: z
      .object({
        ten: z.string().trim().min(2, "Tên khách hàng tối thiểu 2 ký tự.").max(255),
        maSoThue: chuoiTuyChon(30),
        phanKhuc: chuoiTuyChon(50),
        loaiKhach: chuoiTuyChon(50),
        diaChi: chuoiTuyChon(1000),
      })
      .optional()
      .nullable(),
    taoLienHe: z.boolean().optional().default(true),
    coHoi: z
      .object({
        tieuDe: z.string().trim().min(3, "Tiêu đề cơ hội tối thiểu 3 ký tự.").max(255),
        giaTri: soTien.optional().default("0"),
        ngayDuKienChot: ngayTuyChon,
        hanhDongKeTiep: z.string().trim().min(3, "Nhập hành động kế tiếp.").max(255),
        ngayHanhDong: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Chọn ngày hành động kế tiếp."),
      })
      .optional()
      .nullable(),
    xacNhanKhongTrung: z.boolean().optional().default(false),
  })
  .refine((d) => d.khachHangId || d.khachMoi, { message: "Chọn khách đã có hoặc nhập thông tin khách mới.", path: ["khachHangId"] });
export type DuLieuChuyenDoiLead = z.infer<typeof LuocDoChuyenDoiLead>;

export const LuocDoLocLead = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang mở (mặc định); "tat-ca"; hoặc một giai đoạn. */
  giaiDoan: z.enum(["", "tat-ca", "NEW_LEAD", "CONTACTED", "QUALIFIED", "DISQUALIFIED", "CONVERTED"]).optional().default(""),
  nguon: z.string().trim().max(50).optional().default(""),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocLead = z.infer<typeof LuocDoLocLead>;
