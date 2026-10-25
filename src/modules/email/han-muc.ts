import type { ClientTenant } from "@/lib/db";
import { dauHomNayVN } from "@/lib/dinh-dang";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { chuanHoaNhanQuangCao, soNgayTuNgay, TRAN_NGAY_MAC_DINH_SES, tranKhoiDong, tranNgayHieuLuc } from "./tinh-toan";

/**
 * Hạn mức gửi hôm nay (EG-07, EG-10) — một chỗ tính cho cả worker (gui.ts) lẫn màn hình (Kết nối
 * email, chi tiết chiến dịch), để con số người vận hành thấy là con số máy dùng.
 */

export const KHOA_NHAN_QUANG_CAO = "email.nhan_quang_cao";

/** Nhãn quảng cáo đang dùng (EG-06). Lưu ở `tenant_settings` dạng chuỗi — ô Cấu hình chỉ nhận số (QĐ-73). */
export async function docNhanQuangCao(tx: ClientTenant): Promise<string> {
  const d = await tx.tenantSetting.findFirst({ where: { key: KHOA_NHAN_QUANG_CAO, status: "hoat-dong" }, select: { value: true } });
  return chuanHoaNhanQuangCao(d?.value);
}

export interface HanMucHomNay {
  moiPhut: number;
  moiPhutMacDinh: boolean;
  /** Trần ngày đã đặt ở Cấu hình (hoặc mặc định SES). null = không chặn theo ngày. */
  tranNgayDat: number | null;
  tranNgayMacDinhSes: boolean;
  khoiDong: { ngayBatDau: number; ngayThu: number; mucDau: number; heSo: number; tranHomNay: number } | null;
  /** Trần thật hôm nay = min(trần đã đặt, đường khởi động). */
  tranHomNay: number | null;
  daGuiHomNay: number;
  conLaiHomNay: number | null;
  toiDaMoiDiaChi24h: number;
}

export async function docHanMucHomNay(tx: ClientTenant, kenh: string, bayGio: Date = new Date()): Promise<HanMucHomNay> {
  const [moiPhutDat, tranDat, ngayBatDau, mucDau, heSo, moiDiaChi] = await Promise.all([
    docCauHinh(tx, "email.so_thu_moi_phut"),
    docCauHinh(tx, "email.so_thu_toi_da_moi_ngay"),
    docCauHinh(tx, "email.khoi_dong_ngay_bat_dau"),
    docCauHinh(tx, "email.khoi_dong_muc_dau"),
    docCauHinh(tx, "email.khoi_dong_he_so"),
    docCauHinh(tx, "email.toi_da_thu_moi_dia_chi_24h"),
  ]);
  const daDatMoiPhut = await tx.tenantSetting.count({ where: { key: "email.so_thu_moi_phut", status: "hoat-dong" } });
  const tranNgayMacDinhSes = tranDat === null && kenh === "ses";
  const tranNgayDat = tranDat ?? (kenh === "ses" ? TRAN_NGAY_MAC_DINH_SES : null);
  const kd = tranKhoiDong(ngayBatDau, mucDau, heSo, bayGio);
  const tranHomNay = tranNgayHieuLuc(tranNgayDat, kd);
  // Tính cả thư worker khác đã NHẬN (SENDING) mà chưa gửi xong: chỉ đếm sent_at thì worker thứ hai vào
  // nhận việc lúc worker đầu đang gửi sẽ thấy cả trần còn nguyên và gửi vượt trần ngày / khởi động
  // (QA 0.18.0 đo được 20 thư với trần 10). Cùng cách "thư/phút" đã tính SENDING theo attempt_at.
  const dauNgay = dauHomNayVN(bayGio);
  const daGuiHomNay = await tx.emailRecipient.count({ where: { OR: [{ sentAt: { gte: dauNgay } }, { status: "SENDING", attemptAt: { gte: dauNgay } }] } });
  return {
    moiPhut: moiPhutDat ?? 10,
    moiPhutMacDinh: daDatMoiPhut === 0,
    tranNgayDat,
    tranNgayMacDinhSes,
    khoiDong:
      kd !== null && ngayBatDau !== null
        ? { ngayBatDau, ngayThu: (soNgayTuNgay(ngayBatDau, bayGio) ?? 0) + 1, mucDau: mucDau!, heSo: heSo!, tranHomNay: kd }
        : null,
    tranHomNay,
    daGuiHomNay,
    conLaiHomNay: tranHomNay === null ? null : Math.max(0, tranHomNay - daGuiHomNay),
    toiDaMoiDiaChi24h: moiDiaChi ?? 3,
  };
}
