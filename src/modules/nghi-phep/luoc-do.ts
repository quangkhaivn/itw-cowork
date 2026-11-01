import { z } from "zod";

/** Lược đồ đơn nghỉ (0.19.0). Luật: BUSINESS_RULES.md mục 30 (NS-30 → NS-35). */

const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ.");

export const LuocDoDonNghi = z
  .object({
    loaiNghiId: z.uuid("Chọn loại nghỉ."),
    tuNgay: ngay,
    denNgay: ngay,
    phan: z.enum(["ca-ngay", "sang", "chieu"]).default("ca-ngay"),
    lyDo: z.string().trim().min(2, "Ghi lý do.").max(2000),
  })
  .refine((d) => d.denNgay >= d.tuNgay, { message: "Ngày kết thúc phải từ ngày bắt đầu trở đi.", path: ["denNgay"] })
  .refine((d) => d.phan === "ca-ngay" || d.tuNgay === d.denNgay, { message: "Nghỉ nửa ngày chỉ chọn một ngày.", path: ["phan"] })
  .refine((d) => d.tuNgay.slice(0, 4) === d.denNgay.slice(0, 4), { message: "Đơn nghỉ qua năm mới: tách thành hai đơn (mỗi năm một quỹ phép).", path: ["denNgay"] });

export const LuocDoQuyetDinhNghi = z.object({
  hanhDong: z.enum(["duyet", "tu-choi", "huy"]),
  ghiChu: z.string().trim().max(2000).optional().transform((s) => (s ? s : null)),
});
