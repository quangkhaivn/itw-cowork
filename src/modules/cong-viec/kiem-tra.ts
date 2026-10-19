/**
 * Kiểm tra trước khi đánh dấu một công việc là xong — hàm THUẦN, không đụng CSDL.
 *
 * Cùng một hàm chạy ở hai chỗ: màn hình hỏi trước để hiện cho người làm biết còn thiếu gì
 * (`GET /api/v1/cong-viec/:id/kiem-tra`), và service chạy lại ngay trong giao dịch lúc ghi
 * — giao diện có thể cũ, máy chủ thì không được tin giao diện (CV-06).
 *
 * Hai mức:
 *  - **loi**: chặn. Thiếu kết quả, thiếu đánh giá, còn mục kiểm tra bắt buộc, việc đã hủy,
 *    "Cần làm tiếp" mà không hẹn việc tiếp theo.
 *  - **canhBao**: không chặn, chỉ nhắc. Hồ sơ khách còn thiếu trường bắt buộc — chặn việc
 *    của nhân viên chỉ vì khách chưa có mã số thuế là phạt nhầm người (HS-04).
 */

export const DO_DAI_KET_QUA_TOI_THIEU = 10;

export interface MucKiemTraGon {
  nhan: string;
  batBuoc: boolean;
  daTich: boolean;
}

export interface DauVaoKiemTra {
  trangThai: string;
  ketQua: string | null | undefined;
  danhGia: string | null | undefined;
  mucKiemTra: MucKiemTraGon[];
  /** Có hẹn việc tiếp theo kèm lần hoàn thành này không (CV-09). */
  coViecTiepTheo: boolean;
  /** Hồ sơ khách gắn với việc, nếu có. */
  hoSoKhach?: { tenKhach: string; thieuBatBuoc: string[] } | null;
}

export interface VanDe {
  ma: string;
  thongBao: string;
}

export interface KetQuaKiemTra {
  duocXong: boolean;
  loi: VanDe[];
  canhBao: VanDe[];
}

export function kiemTraTruocKhiXong(d: DauVaoKiemTra): KetQuaKiemTra {
  const loi: VanDe[] = [];
  const canhBao: VanDe[] = [];

  if (d.trangThai === "huy") {
    loi.push({ ma: "viec-da-huy", thongBao: "Việc đã hủy. Mở lại việc trước khi đánh dấu xong." });
  }

  const ketQua = (d.ketQua ?? "").trim();
  if (ketQua.length < DO_DAI_KET_QUA_TOI_THIEU) {
    loi.push({
      ma: "thieu-ket-qua",
      thongBao: `Ghi kết quả công việc (tối thiểu ${DO_DAI_KET_QUA_TOI_THIEU} ký tự): đã làm gì, khách nói gì, bước tiếp theo.`,
    });
  }
  if (!d.danhGia) loi.push({ ma: "thieu-danh-gia", thongBao: "Chọn đánh giá kết quả: Đạt, Đạt một phần, Không đạt hoặc Cần làm tiếp." });

  const conThieu = d.mucKiemTra.filter((m) => m.batBuoc && !m.daTich);
  if (conThieu.length) {
    loi.push({
      ma: "muc-kiem-tra-chua-xong",
      thongBao: `Còn ${conThieu.length} mục kiểm tra bắt buộc chưa xong: ${conThieu.map((m) => `“${m.nhan}”`).join(", ")}.`,
    });
  }
  const tuyChonChuaTich = d.mucKiemTra.filter((m) => !m.batBuoc && !m.daTich).length;
  if (tuyChonChuaTich) {
    canhBao.push({ ma: "muc-tuy-chon-chua-tich", thongBao: `Còn ${tuyChonChuaTich} mục kiểm tra không bắt buộc chưa tích.` });
  }

  if (d.danhGia === "can-theo-doi" && !d.coViecTiepTheo) {
    loi.push({ ma: "thieu-viec-tiep-theo", thongBao: "Đánh giá “Cần làm tiếp” thì phải hẹn việc tiếp theo (việc gì, hạn khi nào)." });
  }

  if (d.hoSoKhach && d.hoSoKhach.thieuBatBuoc.length) {
    canhBao.push({
      ma: "ho-so-khach-thieu",
      thongBao: `Hồ sơ khách ${d.hoSoKhach.tenKhach} còn thiếu: ${d.hoSoKhach.thieuBatBuoc.join(", ")}. Nên bổ sung ngay khi còn nhớ.`,
    });
  }

  return { duocXong: loi.length === 0, loi, canhBao };
}
