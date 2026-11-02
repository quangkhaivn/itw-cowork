import { z } from "zod";
import {
  bieuThueHopLe,
  CACH_TRA,
  COT_NGAN_HANG,
  LOAI_HOP_DONG,
  LOAI_THAM_SO,
  PHUONG_PHAP_THUE,
  type LoaiThamSo,
} from "./tinh-toan";

/**
 * Lược đồ dữ liệu vào của phân hệ lương (BUSINESS_RULES mục 32). Thông báo lỗi tiếng Việt có dấu.
 */

const NGAY = /^\d{4}-\d{2}-\d{2}$/;
const THANG = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ngayHopLe = z
  .string()
  .regex(NGAY, "Ngày dạng NĂM-THÁNG-NGÀY (vd 2026-11-01).")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Ngày không có thật.");

/**
 * Trần một khoản tiền nhập tay (1.000 tỷ đ). QA 0.21.0: trước đây nhận tới 9×10^15 — gõ thừa vài số 0 vào lương / phụ
 * cấp / khoản làm tổng thu nhập vượt số nguyên an toàn, lần tính lương của CẢ KỲ hỏng lỗi máy 500 thay vì báo ô nhập sai.
 */
export const TIEN_TOI_DA = 1_000_000_000_000;

/** Số tiền nguyên VND: nhận số hoặc chuỗi "12.500.000" / "12500000". */
export const soTien = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[.\s₫đ,]/g, ""));
    if (!Number.isSafeInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Số tiền là số nguyên VND không âm." });
      return z.NEVER;
    }
    if (n > TIEN_TOI_DA) {
      ctx.addIssue({ code: "custom", message: "Số tiền quá lớn (tối đa 1.000 tỷ đ) — kiểm lại số chữ số 0." });
      return z.NEVER;
    }
    return n;
  });

const soTienDuong = soTien.refine((n) => n > 0, "Số tiền phải lớn hơn 0.");

const chuoiTuyChon = (toiDa: number) =>
  z
    .string()
    .trim()
    .max(toiDa)
    .optional()
    .nullable()
    .transform((s) => (s ? s : null));

export const LuocDoTaoKy = z.object({
  nam: z.coerce.number().int().min(2000, "Năm không hợp lệ.").max(2100, "Năm không hợp lệ."),
  thang: z.coerce.number().int().min(1, "Tháng 1 – 12.").max(12, "Tháng 1 – 12."),
});

export const LuocDoHoSoLuong = z
  .object({
    nguoiId: z.uuid("Chọn nhân viên."),
    hieuLucTu: ngayHopLe,
    loaiHopDong: z.enum(LOAI_HOP_DONG, "Chọn loại hợp đồng."),
    tyLeThuViec: z.coerce.number().min(1).max(100).nullable().optional(),
    cachTra: z.enum(CACH_TRA, "Chọn cách trả lương."),
    luongCoBan: soTien,
    luongDongBH: soTien.default(0),
    thuongKpi: soTien.default(0),
    huongHoaHong: z.boolean().default(false),
    phuongPhapThue: z.enum(PHUONG_PHAP_THUE, "Chọn cách khấu trừ thuế."),
    phuCap: z.array(z.object({ loaiId: z.uuid(), soTien: soTien })).max(20).default([]),
    soTaiKhoan: z
      .string()
      .trim()
      .max(50)
      .regex(/^[0-9A-Za-z-]*$/, "Số tài khoản chỉ gồm chữ số / chữ cái / gạch ngang.")
      .optional()
      .nullable()
      .transform((s) => (s ? s : null)),
    nganHang: chuoiTuyChon(255),
    chuTaiKhoan: chuoiTuyChon(255),
    maSoThue: z
      .string()
      .trim()
      .regex(/^(\d{10}|\d{10}-\d{3}|\d{12})?$/, "Mã số thuế cá nhân: 10 số, 10 số-3 số, hoặc 12 số (số định danh).")
      .optional()
      .nullable()
      .transform((s) => (s ? s : null)),
    ghiChu: chuoiTuyChon(1000),
  })
  .superRefine((d, ctx) => {
    if (d.loaiHopDong === "thu-viec" && !d.tyLeThuViec) ctx.addIssue({ code: "custom", path: ["tyLeThuViec"], message: "Nhập % lương thử việc." });
    if (new Set(d.phuCap.map((p) => p.loaiId)).size !== d.phuCap.length) ctx.addIssue({ code: "custom", path: ["phuCap"], message: "Mỗi loại phụ cấp chỉ chọn một lần." });
  })
  .transform((d) => ({ ...d, tyLeThuViec: d.loaiHopDong === "thu-viec" ? (d.tyLeThuViec ?? null) : null }));

export const LuocDoLoaiPhuCap = z.object({
  ma: z.string().trim().regex(/^[a-z0-9-]{1,50}$/, "Mã: chữ thường không dấu, số, gạch ngang."),
  ten: z.string().trim().min(2, "Tên ít nhất 2 ký tự.").max(255),
  chiuThue: z.boolean(),
  tinhBH: z.boolean(),
  theo: z.enum(["thang", "ngay-cong"]),
  thuTu: z.coerce.number().int().min(0).max(10_000).default(0),
  trangThai: z.enum(["hoat-dong", "ngung"]).default("hoat-dong"),
});

export const LuocDoNguoiPhuThuoc = z.object({
  nguoiId: z.uuid("Chọn nhân viên."),
  hoTen: z.string().trim().min(2, "Họ tên ít nhất 2 ký tự.").max(255),
  quanHe: z.string().trim().min(2, "Ghi quan hệ (con, cha, mẹ…).").max(50),
  soGiayTo: chuoiTuyChon(30),
  tuThang: z.string().regex(THANG, "Tháng dạng NĂM-THÁNG (vd 2026-01)."),
  denThang: z
    .string()
    .regex(THANG, "Tháng dạng NĂM-THÁNG.")
    .optional()
    .nullable()
    .transform((s) => (s ? s : null)),
});

export const LuocDoKetThucNguoiPhuThuoc = z.object({ denThang: z.string().regex(THANG, "Tháng dạng NĂM-THÁNG (vd 2026-12).") });

export const LOAI_KHOAN = ["thuong", "phu-cap-khac", "tam-ung", "phat", "dieu-chinh", "khac"] as const;
export const NHAN_LOAI_KHOAN: Record<(typeof LOAI_KHOAN)[number], string> = {
  thuong: "Thưởng đột xuất",
  "phu-cap-khac": "Phụ cấp khác",
  "tam-ung": "Tạm ứng",
  phat: "Phạt",
  "dieu-chinh": "Điều chỉnh kỳ trước",
  khac: "Khác",
};

export const LuocDoKhoan = z
  .object({
    nguoiId: z.uuid("Chọn nhân viên."),
    chieu: z.enum(["cong", "tru"]),
    loai: z.enum(LOAI_KHOAN),
    soTien: soTienDuong,
    chiuThue: z.boolean().default(true),
    lyDo: z.string().trim().min(5, "Lý do ít nhất 5 ký tự.").max(1000),
    kyGocId: z
      .union([z.uuid("Kỳ gốc không hợp lệ."), z.literal("")])
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .superRefine((d, ctx) => {
    if ((d.loai === "dieu-chinh") !== Boolean(d.kyGocId)) ctx.addIssue({ code: "custom", path: ["kyGocId"], message: "Khoản điều chỉnh phải chọn kỳ đã khóa được điều chỉnh (và chỉ khoản điều chỉnh)." });
    if (d.loai === "dieu-chinh" && d.lyDo.length < 10) ctx.addIssue({ code: "custom", path: ["lyDo"], message: "Lý do điều chỉnh ít nhất 10 ký tự." });
    if ((d.loai === "tam-ung" || d.loai === "phat") && d.chieu !== "tru") ctx.addIssue({ code: "custom", path: ["chieu"], message: "Tạm ứng / phạt là khoản trừ." });
    if ((d.loai === "thuong" || d.loai === "phu-cap-khac") && d.chieu !== "cong") ctx.addIssue({ code: "custom", path: ["chieu"], message: "Thưởng / phụ cấp là khoản cộng." });
  });

export const LuocDoLyDo = z.object({ lyDo: z.string().trim().min(5, "Lý do ít nhất 5 ký tự.").max(1000) });

// ---------------------------------------------------------------------------
// Tham số theo loại (LU-10)
// ---------------------------------------------------------------------------

const phanTram = z.number("Nhập số.").min(0, "Không âm.").max(100, "Tối đa 100%.");
const tienTs = z.number("Nhập số.").int("Số nguyên VND.").min(0, "Không âm.");

const THAM_SO: Record<LoaiThamSo, z.ZodType> = {
  "bao-hiem": z.object({
    nld: z.object({ bhxh: phanTram, bhyt: phanTram, bhtn: phanTram }),
    dn: z.object({ bhxh: phanTram, bhyt: phanTram, bhtn: phanTram, kpcd: phanTram }),
    luongCoSo: tienTs.min(1),
    tranLanLuongCoSo: z.number().min(1).max(100),
    tranLanToiThieuVung: z.number().min(1).max(100),
    ngayNghiKhongDong: z.number().min(1).max(31),
  }),
  "luong-toi-thieu-vung": z.object({
    vung: z.number().int().min(1, "Vùng 1 – 4.").max(4, "Vùng 1 – 4."),
    mucVung: z.object({ "1": tienTs.min(1), "2": tienTs.min(1), "3": tienTs.min(1), "4": tienTs.min(1) }),
  }),
  "giam-tru": z.object({ banThan: tienTs, nguoiPhuThuoc: tienTs }),
  "bieu-thue": z
    .object({ bac: z.array(z.object({ den: tienTs.min(1).nullable(), tyLe: phanTram })).min(1).max(15) })
    .superRefine((v, ctx) => {
      const loi = bieuThueHopLe(v.bac);
      if (loi) ctx.addIssue({ code: "custom", path: ["bac"], message: loi });
    }),
  "khau-tru-10": z.object({ tyLe: phanTram, nguong: tienTs }),
  "thu-viec": z.object({ tyLeToiThieu: phanTram }),
  "tang-ca": z.object({
    thuong: z.number().min(100).max(1000),
    thuongDem: z.number().min(100).max(1000),
    nghiTuan: z.number().min(100).max(1000),
    nghiTuanDem: z.number().min(100).max(1000),
    le: z.number().min(100).max(1000),
    leDem: z.number().min(100).max(1000),
    phanVuotMienThue: z.boolean(),
  }),
  "hoa-hong": z
    .object({
      kieu: z.enum(["phang", "bac-thang"]),
      tyLe: phanTram,
      bac: z.array(z.object({ tu: tienTs, tyLe: phanTram })).max(20),
    })
    .superRefine((v, ctx) => {
      if (v.kieu === "bac-thang" && v.bac.length === 0) ctx.addIssue({ code: "custom", path: ["bac"], message: "Bậc thang phải có ít nhất một bậc." });
      const tu = v.bac.map((b) => b.tu);
      if (new Set(tu).size !== tu.length) ctx.addIssue({ code: "custom", path: ["bac"], message: "Hai bậc trùng mức doanh số." });
    }),
};

export function luocDoGiaTriThamSo(loai: LoaiThamSo): z.ZodType {
  return THAM_SO[loai];
}

export const LuocDoThamSo = z.object({
  loai: z.enum(LOAI_THAM_SO),
  hieuLucTu: ngayHopLe,
  giaTri: z.unknown(),
  ghiChu: z.string().trim().min(5, "Ghi căn cứ (số văn bản, ngày hiệu lực) ít nhất 5 ký tự.").max(1000),
});

export const LuocDoXuatNganHang = z.object({
  cot: z.array(z.enum(COT_NGAN_HANG)).min(1, "Chọn ít nhất một cột.").max(COT_NGAN_HANG.length),
  noiDung: z.string().trim().min(1, "Nhập mẫu nội dung.").max(200),
  boDau: z.boolean(),
});
