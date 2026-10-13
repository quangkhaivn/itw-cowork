import { timTenantTheoMa, voiTenant, type ClientTenant } from "@/lib/db";
import { demVaKiem } from "@/lib/gioi-han-toc-do";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { ghiNhanBiTuChoi } from "./nhan-lead";
import { LoiTuChoiNhan } from "./form";

/**
 * Đường chạy chung cho mọi yêu cầu CÔNG KHAI (form, landing, webhook) — QĐ-61.
 *
 *   mã doanh nghiệp trên URL → kiểm khuôn dạng → giới hạn tốc độ theo IP (chưa chạm CSDL)
 *   → tra sổ đăng ký `tenants` (bảng duy nhất được đọc ngoài ngữ cảnh tenant)
 *   → `voiTenant()` của ĐÚNG doanh nghiệp đó → service
 *
 * Không bao giờ đọc dữ liệu nghiệp vụ trước khi biết tenant, nên form của doanh nghiệp A
 * không thể chạm dữ liệu của doanh nghiệp B dù trùng slug. Lần nhận bị từ chối được ghi
 * nhật ký trong một giao dịch RIÊNG, vì giao dịch chính đã cuộn ngược.
 */

export const LA_MA_DOANH_NGHIEP = /^[a-z0-9][a-z0-9-]{0,49}$/;

/** Trần kỹ thuật chống spam — không phải ngưỡng nghiệp vụ (cùng loại với trần dò mật khẩu ở ARCHITECTURE.md mục 5). */
export const GIOI_HAN_CONG_KHAI = {
  form: { toiDa: 20, cuaSoGiay: 600 },
  webhook: { toiDa: 120, cuaSoGiay: 60 },
} as const;

export class LoiQuaToc extends LoiNghiepVu {
  constructor(public readonly conLaiGiay: number) {
    super("Gửi quá nhiều lần. Vui lòng thử lại sau ít phút.", 429, "qua-toc-do");
    this.name = "LoiQuaToc";
  }
}

export async function giaiTenantCongKhai(maDoanhNghiep: string) {
  if (!LA_MA_DOANH_NGHIEP.test(maDoanhNghiep)) return null;
  return timTenantTheoMa(maDoanhNghiep);
}

export async function chayNhanCongKhai<T>(
  maDoanhNghiep: string,
  loai: keyof typeof GIOI_HAN_CONG_KHAI,
  ip: string | null,
  congViec: (tx: ClientTenant, tenantId: string) => Promise<T>,
): Promise<T> {
  if (!LA_MA_DOANH_NGHIEP.test(maDoanhNghiep)) throw new LoiKhongTimThay("Doanh nghiệp");
  const gh = GIOI_HAN_CONG_KHAI[loai];
  const dem = await demVaKiem(`cong-khai:${loai}:${maDoanhNghiep}:${ip ?? "khong-ro"}`, gh.toiDa, gh.cuaSoGiay);
  if (!dem.choPhep) throw new LoiQuaToc(dem.conLaiGiay);
  const t = await timTenantTheoMa(maDoanhNghiep);
  if (!t) throw new LoiKhongTimThay("Doanh nghiệp");
  try {
    return await voiTenant(t.id, (tx) => congViec(tx, t.id));
  } catch (loi) {
    if (loi instanceof LoiTuChoiNhan) {
      await voiTenant(t.id, (tx) => ghiNhanBiTuChoi(tx, t.id, { ...loi.nhatKy, ip })).catch((e) =>
        console.error("[marketing] không ghi được nhật ký từ chối:", e),
      );
    }
    throw loi;
  }
}
