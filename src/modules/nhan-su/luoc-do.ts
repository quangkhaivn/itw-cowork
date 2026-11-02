import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, uuidTuyChon } from "@/modules/crm/chung";
import { gioVePhut, PHAN_NGAY } from "@/modules/cham-cong/tinh-toan";

/** Lược đồ dữ liệu vào của phân hệ Nhân sự (0.19.0). Luật: BUSINESS_RULES.md mục 30. */

export const LOAI_NHAN_SU = ["chinh-thuc", "thu-viec", "thuc-tap", "cong-tac-vien"] as const;
export const NHAN_LOAI_NHAN_SU: Record<(typeof LOAI_NHAN_SU)[number], string> = {
  "chinh-thuc": "Chính thức",
  "thu-viec": "Thử việc",
  "thuc-tap": "Sinh viên thực tập",
  "cong-tac-vien": "Cộng tác viên",
};

export const LOAI_HOP_DONG = ["thu-viec", "xac-dinh-thoi-han", "khong-xac-dinh-thoi-han", "thuc-tap", "cong-tac-vien", "khac"] as const;
export const NHAN_LOAI_HOP_DONG: Record<(typeof LOAI_HOP_DONG)[number], string> = {
  "thu-viec": "Thử việc",
  "xac-dinh-thoi-han": "Xác định thời hạn",
  "khong-xac-dinh-thoi-han": "Không xác định thời hạn",
  "thuc-tap": "Thỏa thuận thực tập",
  "cong-tac-vien": "Cộng tác viên / dịch vụ",
  khac: "Khác",
};

const ten = z.string().trim().min(2, "Tối thiểu 2 ký tự.").max(255);
const ma = z
  .string()
  .trim()
  .min(1, "Nhập mã.")
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, "Mã chỉ gồm chữ không dấu, số, gạch.");
const trangThai = z.enum(["hoat-dong", "ngung-hoat-dong"]).optional();
const gio = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const p = gioVePhut(s);
    if (p === null) {
      ctx.addIssue({ code: "custom", message: "Giờ dạng HH:MM (00:00 – 23:59)." });
      return z.NEVER;
    }
    return p;
  });
const phutTuyChon = z.union([z.number().int().min(0).max(240), z.null()]).optional();

export const LuocDoDiaDiem = z.object({
  ten,
  diaChi: chuoiTuyChon(500),
  viDo: z.coerce.number().min(-90, "Vĩ độ từ -90 đến 90.").max(90, "Vĩ độ từ -90 đến 90."),
  kinhDo: z.coerce.number().min(-180, "Kinh độ từ -180 đến 180.").max(180, "Kinh độ từ -180 đến 180."),
  banKinhM: z.union([z.coerce.number().int().min(10, "Bán kính tối thiểu 10 m.").max(5000, "Bán kính tối đa 5.000 m."), z.null()]).optional(),
  trangThai,
});

export const LuocDoCa = z.object({
  ma,
  ten,
  gioVao: gio,
  gioRa: gio,
  gioNghi: z.union([gio, z.literal(""), z.null()]).optional().transform((x) => (typeof x === "number" ? x : null)),
  phutNghi: z.coerce.number().int().min(0).max(480).default(0),
  choPhepMuonPhut: phutTuyChon,
  choPhepSomPhut: phutTuyChon,
  trangThai,
});

export const LuocDoLich = z.object({
  ma,
  ten,
  caId: z.uuid("Chọn ca làm."),
  ngay: z.array(z.enum(PHAN_NGAY)).length(7, "Lịch tuần phải đủ 7 ngày."),
  trangThai,
});

export const LuocDoGanLich = z.object({
  nguoiIds: z.array(z.uuid()).min(1, "Chọn ít nhất một người.").max(500),
  lichId: z.uuid("Chọn lịch làm."),
  tuNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ."),
  ghiChu: chuoiTuyChon(500),
});

export const LuocDoNgayLe = z.object({
  ngay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ."),
  ten,
});

export const LuocDoSuaNgayLe = z.object({ trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]) });

export const LuocDoHoSoNhanSu = z.object({
  loaiNhanSu: z.enum(LOAI_NHAN_SU).optional(),
  maChamCong: z
    .union([z.string().trim().regex(/^[0-9A-Za-z]{1,20}$/, "Mã chấm công: 1–20 chữ / số, không dấu, không khoảng trắng."), z.literal(""), z.null()])
    .optional()
    .transform((x) => (x === undefined ? undefined : x ? x : null)),
  diaDiemMacDinhId: uuidTuyChon,
  ngayVaoLam: ngayTuyChon,
  thucTap: z
    .object({
      truong: chuoiTuyChon(255),
      khoa: chuoiTuyChon(255),
      mssv: chuoiTuyChon(50),
      giangVienHuongDan: chuoiTuyChon(255),
      nguoiHuongDanId: uuidTuyChon,
      tuNgay: ngayTuyChon,
      denNgay: ngayTuyChon,
      ghiChu: chuoiTuyChon(2000),
    })
    .optional(),
});

export const LuocDoHopDong = z.object({
  nguoiId: z.uuid(),
  loai: z.enum(LOAI_HOP_DONG),
  tuNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Nhập ngày bắt đầu."),
  denNgay: ngayTuyChon,
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoSuaHopDong = z.object({
  loai: z.enum(LOAI_HOP_DONG).optional(),
  tuNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  denNgay: ngayTuyChon,
  ghiChu: chuoiTuyChon(2000),
  trangThai: z.enum(["hieu-luc", "het-hieu-luc", "huy"]).optional(),
});

export const LuocDoLoaiNghi = z.object({
  ma,
  ten,
  coLuong: z.boolean(),
  truPhepNam: z.boolean(),
  thuTu: z.coerce.number().int().min(0).max(10_000).default(0),
  trangThai,
});

export const LuocDoDieuChinhPhep = z.object({
  nguoiId: z.uuid(),
  nam: z.coerce.number().int().min(2020).max(2100),
  soNgay: z.coerce
    .number()
    .refine((x) => x !== 0 && Math.abs(x) <= 365 && Number.isInteger(x * 2), "Số ngày khác 0, bước 0,5, tối đa 365."),
  lyDo: z.string().trim().min(5, "Ghi lý do (tối thiểu 5 ký tự).").max(1000),
});

const dsIp = z.array(z.string().trim().regex(/^[0-9a-fA-F:.]{3,45}$/, "Địa chỉ IP không hợp lệ.")).max(20);

export const LuocDoMayChamCong = z.object({
  soSeri: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{4,64}$/, "Số sê-ri (SN) 4–64 ký tự chữ / số — xem trên máy: Menu → Thông tin hệ thống."),
  ten,
  diaDiemId: z.uuid("Chọn địa điểm đặt máy."),
  ipChoPhep: dsIp.default([]),
  trangThai,
});

export const LuocDoSuaMayChamCong = z.object({
  ten: ten.optional(),
  diaDiemId: z.uuid().optional(),
  ipChoPhep: dsIp.optional(),
  trangThai,
});

export const LuocDoAnhXaPin = z.object({
  pin: z.string().trim().regex(/^[0-9A-Za-z]{1,20}$/),
  nguoiId: z.uuid(),
  /** QĐ-118: áp cả lần chấm thuộc kỳ bảng công ĐÃ KHÓA (sinh dòng điều chỉnh ở kỳ sau) — cần quyền duyệt. */
  apCaKyDaKhoa: z.boolean().default(false),
});
