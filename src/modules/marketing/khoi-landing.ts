import { z } from "zod";

/**
 * Danh mục khối landing page — MK-16. **Khai báo bằng mã**, nội dung lưu JSON và kiểm bằng
 * Zod mỗi lần ghi VÀ mỗi lần đọc. Không có khối nào nhận HTML, CSS hay script: mọi chữ được
 * React tự thoát khi dựng, ảnh và liên kết chỉ nhận `https://`.
 *
 * Thêm khối mới: thêm một phần tử vào `LuocDoKhoi` + nhãn ở `NHAN_KHOI` + một nhánh dựng ở
 * `src/components/marketing/KhoiLanding.tsx` + ô nhập ở trang sửa landing.
 * Tệp thuần, dùng chung cho máy chủ và trình duyệt.
 */

const chu = (toiDa: number, nhan: string) => z.string().trim().min(1, `Nhập ${nhan}.`).max(toiDa, `${nhan} tối đa ${toiDa} ký tự.`);
const chuTuyChon = (toiDa: number) => z.string().trim().max(toiDa).optional().default("");

/** Chỉ nhận https — chặn `javascript:`, `data:`, `http:` (trang công khai dùng TLS). */
export const urlHttps = z
  .string()
  .trim()
  .max(1000)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" && Boolean(u.hostname);
    } catch {
      return false;
    }
  }, "Chỉ nhận địa chỉ bắt đầu bằng https://");

export const LuocDoKhoi = z.discriminatedUnion("loai", [
  z.object({ loai: z.literal("tieu-de"), tieuDe: chu(150, "tiêu đề"), phuDe: chuTuyChon(300) }).strict(),
  z.object({ loai: z.literal("doan-van"), tieuDe: chuTuyChon(150), noiDung: chu(3000, "nội dung") }).strict(),
  z.object({ loai: z.literal("anh"), url: urlHttps, moTa: chu(200, "mô tả ảnh (cho người khiếm thị)"), chuThich: chuTuyChon(200) }).strict(),
  z.object({ loai: z.literal("loi-ich"), tieuDe: chuTuyChon(150), muc: z.array(chu(200, "lợi ích")).min(1, "Thêm ít nhất một lợi ích.").max(12) }).strict(),
  z
    .object({
      loai: z.literal("nut-goi"),
      nhan: chu(60, "chữ trên nút"),
      kieu: z.enum(["form", "dien-thoai", "lien-ket"]),
      giaTri: chuTuyChon(1000),
    })
    .strict()
    .superRefine((k, ctx) => {
      if (k.kieu === "dien-thoai" && !/^\+?[0-9 .()-]{8,20}$/.test(k.giaTri)) ctx.addIssue({ code: "custom", message: "Số điện thoại không hợp lệ.", path: ["giaTri"] });
      if (k.kieu === "lien-ket" && !urlHttps.safeParse(k.giaTri).success) ctx.addIssue({ code: "custom", message: "Liên kết phải bắt đầu bằng https://", path: ["giaTri"] });
    }),
  z.object({ loai: z.literal("form"), tieuDe: chuTuyChon(150) }).strict(),
  z
    .object({
      loai: z.literal("hoi-dap"),
      tieuDe: chuTuyChon(150),
      muc: z.array(z.object({ hoi: chu(300, "câu hỏi"), dap: chu(2000, "câu trả lời") }).strict()).min(1, "Thêm ít nhất một câu hỏi.").max(20),
    })
    .strict(),
  z.object({ loai: z.literal("trich-dan"), noiDung: chu(1000, "lời khách"), nguoi: chuTuyChon(150) }).strict(),
]);
export type KhoiLanding = z.infer<typeof LuocDoKhoi>;
export type LoaiKhoi = KhoiLanding["loai"];

export const LuocDoDanhSachKhoi = z.array(LuocDoKhoi).max(30, "Tối đa 30 khối một trang.");

export const NHAN_KHOI: Record<LoaiKhoi, string> = {
  "tieu-de": "Tiêu đề lớn",
  "doan-van": "Đoạn văn",
  anh: "Ảnh",
  "loi-ich": "Danh sách lợi ích",
  "nut-goi": "Nút kêu gọi",
  form: "Form đăng ký",
  "hoi-dap": "Câu hỏi thường gặp",
  "trich-dan": "Lời khách hàng",
};

/** Khối trống mặc định khi người dùng bấm "Thêm khối". */
export function khoiMoi(loai: LoaiKhoi): KhoiLanding {
  switch (loai) {
    case "tieu-de":
      return { loai, tieuDe: "Tiêu đề", phuDe: "" };
    case "doan-van":
      return { loai, tieuDe: "", noiDung: "Nội dung" };
    case "anh":
      return { loai, url: "https://", moTa: "", chuThich: "" };
    case "loi-ich":
      return { loai, tieuDe: "", muc: ["Lợi ích"] };
    case "nut-goi":
      return { loai, nhan: "Đăng ký ngay", kieu: "form", giaTri: "" };
    case "form":
      return { loai, tieuDe: "" };
    case "hoi-dap":
      return { loai, tieuDe: "Câu hỏi thường gặp", muc: [{ hoi: "Câu hỏi", dap: "Câu trả lời" }] };
    case "trich-dan":
      return { loai, noiDung: "Lời khách", nguoi: "" };
  }
}

/** Mẫu khởi đầu cho landing mới — chữ giữ chỗ, người dùng thay bằng nội dung thật. */
export const MAU_KHOI_MAC_DINH: KhoiLanding[] = [
  { loai: "tieu-de", tieuDe: "Tiêu đề chính của chương trình", phuDe: "Một câu nói rõ khách được gì" },
  { loai: "loi-ich", tieuDe: "Vì sao chọn chúng tôi", muc: ["Lợi ích thứ nhất", "Lợi ích thứ hai", "Lợi ích thứ ba"] },
  { loai: "nut-goi", nhan: "Đăng ký tư vấn", kieu: "form", giaTri: "" },
  { loai: "form", tieuDe: "Để lại thông tin, chúng tôi gọi lại" },
];

/** Đọc khối đã lưu: hỏng lược đồ (sửa tay CSDL) thì trả null để trang công khai không dựng bừa. */
export function docKhoi(json: unknown): KhoiLanding[] | null {
  const p = LuocDoDanhSachKhoi.safeParse(json);
  return p.success ? p.data : null;
}
