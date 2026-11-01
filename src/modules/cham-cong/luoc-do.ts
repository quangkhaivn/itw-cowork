import { z } from "zod";

/** Lược đồ dữ liệu vào của chấm công (0.19.0). Luật: BUSINESS_RULES.md mục 30. */

/** Phiên bản thông báo xử lý dữ liệu vị trí. Đổi nội dung thông báo → tăng phiên bản → nhân viên xác nhận lại. */
export const PHIEN_BAN_THONG_BAO_VI_TRI = "2026-11-v1";

export const LuocDoChamGps = z.object({
  huong: z.enum(["vao", "ra"]),
  viDo: z.number().min(-90).max(90).nullable().optional(),
  kinhDo: z.number().min(-180).max(180).nullable().optional(),
  doChinhXacM: z.number().min(0).max(100_000).nullable().optional(),
  /** Giờ trên điện thoại — chỉ để tham khảo, giờ máy chủ mới là giờ chấm (NS-13). */
  gioMay: z.string().max(40).nullable().optional(),
  /** Trình duyệt không lấy được vị trí: tu-choi (người dùng chặn quyền), khong-ho-tro, het-gio, loi-khac. */
  loiViTri: z.enum(["tu-choi", "khong-ho-tro", "het-gio", "loi-khac"]).nullable().optional(),
});
export type DuLieuChamGps = z.infer<typeof LuocDoChamGps>;

export const LuocDoXacNhanViTri = z.object({ phienBan: z.literal(PHIEN_BAN_THONG_BAO_VI_TRI) });

export const LuocDoXemXet = z.object({
  quyetDinh: z.enum(["chap-nhan", "tu-choi"]),
  ghiChu: z.string().trim().max(1000).optional().transform((s) => (s ? s : null)),
});

export const LuocDoLocTrucTiep = z.object({
  phongBanId: z.union([z.uuid(), z.literal("")]).optional().transform((x) => x || null),
  diaDiemId: z.union([z.uuid(), z.literal("")]).optional().transform((x) => x || null),
});

const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ.");

export const LuocDoGiaiTrinh = z.object({
  ngay,
  /** Giờ "HH:MM" theo giờ Việt Nam của ngày công (ca qua đêm: giờ ra có thể là sáng hôm sau — chọn `sangHomSau`). */
  gio: z.string().regex(/^\d{2}:\d{2}$/, "Giờ dạng HH:MM."),
  sangHomSau: z.boolean().default(false),
  huong: z.enum(["vao", "ra"]),
  lyDo: z.string().trim().min(5, "Ghi rõ lý do (tối thiểu 5 ký tự).").max(2000),
});

export const LuocDoQuyetDinh = z.object({
  hanhDong: z.enum(["duyet", "tu-choi", "huy"]),
  ghiChu: z.string().trim().max(2000).optional().transform((s) => (s ? s : null)),
  /** Chỉ đơn tăng ca: số giờ duyệt (≤ số giờ xin). Bỏ trống = duyệt đúng số giờ xin. */
  gioDuyet: z.coerce.number().positive().max(24).optional(),
});

export const LuocDoTangCa = z.object({
  ngay,
  soGio: z.coerce.number().positive("Số giờ phải lớn hơn 0.").max(24, "Tối đa 24 giờ."),
  lyDo: z.string().trim().min(2, "Ghi lý do.").max(2000),
});

export const LuocDoLocDon = z.object({
  loai: z.enum(["cua-toi", "cho-toi-duyet", "tat-ca"]).default("cua-toi"),
  trangThai: z.enum(["", "cho-duyet", "da-duyet", "tu-choi", "da-huy"]).default(""),
});

export const LuocDoSinhBangCong = z.object({
  nam: z.coerce.number().int().min(2020).max(2100),
  thang: z.coerce.number().int().min(1).max(12),
});

export const LuocDoPhanHoiCong = z.object({
  ngay: z.union([ngay, z.literal(""), z.null()]).optional().transform((x) => x || null),
  noiDung: z.string().trim().min(5, "Ghi rõ nội dung (tối thiểu 5 ký tự).").max(2000),
});

export const LuocDoGiaiQuyetPhanHoi = z.object({
  giaiQuyet: z.string().trim().min(2, "Ghi cách giải quyết.").max(2000),
});

export const LuocDoNhapCsv = z.object({
  noiDung: z.string().min(1, "Chọn tệp CSV.").max(5_000_000, "Tệp quá lớn (tối đa 5 MB)."),
  ghi: z.boolean().default(false),
});
