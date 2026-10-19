/**
 * Độ đầy đủ của hồ sơ khách hàng — hàm THUẦN (HS-01 → HS-03).
 *
 * Không lưu điểm vào CSDL: tính lúc đọc từ chính các trường của khách, nên không bao giờ
 * lệch với dữ liệu thật và không cần chạy lại khi đổi luật.
 *
 * Trường nào bắt buộc tùy **loại khách**: doanh nghiệp / đại lý cần mã số thuế và người liên
 * hệ (xuất hóa đơn, biết gọi ai); khách cá nhân thì hai thứ đó không áp dụng — không trừ
 * điểm khách cá nhân vì thiếu mã số thuế.
 */

export interface DauVaoHoSo {
  loaiKhach: string | null;
  maSoThue: string | null;
  dienThoai: string | null;
  email: string | null;
  diaChi: string | null;
  tinhThanh: string | null;
  nganh: string | null;
  nguon: string | null;
  /** Số người liên hệ đang hoạt động. */
  soLienHe: number;
}

export type MucDoHoSo = "day-du" | "can-bo-sung" | "thieu-bat-buoc";

export interface TruongHoSo {
  ma: string;
  nhan: string;
  batBuoc: boolean;
  co: boolean;
  /** Gợi ý ngắn: bổ sung ở đâu. */
  goiY: string;
}

export interface KetQuaHoSo {
  diem: number;
  mucDo: MucDoHoSo;
  truong: TruongHoSo[];
  thieuBatBuoc: string[];
  thieuNenCo: string[];
}

const LOAI_PHAP_NHAN = new Set(["doanh-nghiep", "dai-ly"]);

const co = (v: string | null | undefined) => !!v && v.trim().length > 0;

export function danhGiaHoSoKhach(k: DauVaoHoSo): KetQuaHoSo {
  // Chưa chọn loại khách thì coi như pháp nhân: khách của TGTH chủ yếu là doanh nghiệp,
  // và đòi thừa một trường an toàn hơn bỏ sót mã số thuế lúc xuất hóa đơn.
  const phapNhan = !k.loaiKhach || LOAI_PHAP_NHAN.has(k.loaiKhach);

  // [mã, nhãn, bắt buộc, có, trọng số, gợi ý]
  const ds: [string, string, boolean, boolean, number, string][] = [
    ["lien-lac", "điện thoại hoặc email", true, co(k.dienThoai) || co(k.email), 25, "Sửa khách → Điện thoại / Email"],
    ["loai-khach", "loại khách", true, co(k.loaiKhach), 10, "Sửa khách → Loại khách"],
    ["dia-chi", "địa chỉ", false, co(k.diaChi), 10, "Sửa khách → Địa chỉ"],
    ["tinh-thanh", "tỉnh/thành", false, co(k.tinhThanh), 5, "Sửa khách → Tỉnh/thành"],
    ["nguon", "nguồn khách", false, co(k.nguon), 10, "Sửa khách → Nguồn"],
  ];
  if (phapNhan) {
    ds.push(["ma-so-thue", "mã số thuế", true, co(k.maSoThue), 15, "Sửa khách → Mã số thuế"]);
    ds.push(["lien-he", "người liên hệ", true, k.soLienHe > 0, 15, "Mục Người liên hệ → Thêm liên hệ"]);
    ds.push(["nganh", "ngành nghề", false, co(k.nganh), 5, "Sửa khách → Ngành nghề"]);
  }
  // Có cả hai kênh liên lạc thì tốt hơn một: khi số máy đổi vẫn còn đường gửi báo giá.
  ds.push(["du-hai-kenh", "đủ cả điện thoại lẫn email", false, co(k.dienThoai) && co(k.email), 5, "Sửa khách → Điện thoại / Email"]);

  const tong = ds.reduce((s, d) => s + d[4], 0);
  const dat = ds.reduce((s, d) => s + (d[3] ? d[4] : 0), 0);
  const diem = Math.round((dat / tong) * 100);

  const truong: TruongHoSo[] = ds.map(([ma, nhan, batBuoc, c, , goiY]) => ({ ma, nhan, batBuoc, co: c, goiY }));
  const thieuBatBuoc = truong.filter((t) => t.batBuoc && !t.co).map((t) => t.nhan);
  const thieuNenCo = truong.filter((t) => !t.batBuoc && !t.co).map((t) => t.nhan);
  const mucDo: MucDoHoSo = thieuBatBuoc.length ? "thieu-bat-buoc" : thieuNenCo.length ? "can-bo-sung" : "day-du";

  return { diem, mucDo, truong, thieuBatBuoc, thieuNenCo };
}

export const NHAN_MUC_DO_HO_SO: Record<MucDoHoSo, string> = {
  "day-du": "Đầy đủ",
  "can-bo-sung": "Nên bổ sung",
  "thieu-bat-buoc": "Thiếu thông tin bắt buộc",
};
