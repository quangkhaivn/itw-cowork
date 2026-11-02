import { NHAN_TANG_CA, type DauVaoLuong, type KetQuaLuong } from "@/modules/luong/tinh-toan";

/**
 * Tờ phiếu lương khổ A4 (LU-43) — theo phong cách bản in hiện có (`.to-in`, `.bang-in`, `.chan-in`). Thành phần thuần
 * (không đọc CSDL) để trang in và bài thử dùng chung. In / lưu PDF bằng hộp thoại in của trình duyệt (QĐ-21).
 */
export interface DuLieuPhieuLuongIn {
  congTy: { ten: string; diaChi: string | null; maSoThue: string | null };
  ky: string;
  banNhap: boolean;
  nguoi: { hoTen: string; maNv: string | null; chucDanh: string | null; phongBan: string | null };
  dauVao: DauVaoLuong;
  ketQua: KetQuaLuong;
  hoaHong: { loai: string; soPhieu: string; ngayThu: string; soTien: number; tyLe: number; hoaHong: number }[];
  ngayIn: string;
}

const d = (n: number) => n.toLocaleString("vi-VN");

export default function PhieuLuongIn({ p }: { p: DuLieuPhieuLuongIn }) {
  const k = p.ketQua;
  const c = p.dauVao.cong;
  const thuNhap: [string, number][] = [
    [`Lương theo công (${k.congTinhLuong} / ${c.chuan} công)`, k.luongTheoCong],
    ...k.phuCap.map((x) => [`Phụ cấp ${x.ten}${x.chiuThue ? "" : " (không chịu thuế)"}`, x.soTien] as [string, number]),
    ...k.tangCa.chiTiet.map((x) => [`Tăng ca ${NHAN_TANG_CA[x.loai].toLowerCase()} ${Math.round((x.phut / 60) * 100) / 100} giờ × ${x.heSo}%`, x.tien] as [string, number]),
    ...(k.thuongKpi ? [[`Thưởng KPI (hệ số ${p.dauVao.kpi.heSo ?? 0})`, k.thuongKpi] as [string, number]] : []),
    ...(k.hoaHong.tien ? [[`Hoa hồng (${d(k.hoaHong.doanhSo)} đ đã thu × ${k.hoaHong.tyLeBp / 100}%)`, k.hoaHong.tien] as [string, number]] : []),
    ...(k.hoaHong.truyThu ? [["Truy thu hoa hồng (phiếu thu đã hủy)", k.hoaHong.truyThu] as [string, number]] : []),
    ...p.dauVao.khoan.filter((x) => x.chieu === "cong").map((x) => [`${x.lyDo}`, x.soTien] as [string, number]),
  ];
  const khauTru: [string, number][] = [
    ["BHXH (người lao động)", k.baoHiem.nld.bhxh],
    ["BHYT (người lao động)", k.baoHiem.nld.bhyt],
    ["BHTN (người lao động)", k.baoHiem.nld.bhtn],
    ["Thuế thu nhập cá nhân", k.thue.tien],
    ...p.dauVao.khoan.filter((x) => x.chieu === "tru").map((x) => [x.lyDo, x.soTien] as [string, number]),
  ];
  return (
    <article className="to-in phieu-luong">
      {p.banNhap && <div className="dau-nhap">BẢN NHÁP — KỲ LƯƠNG CHƯA KHÓA</div>}
      <header className="dau-in">
        <div>
          <h1>{p.congTy.ten}</h1>
          {p.congTy.diaChi && <div>{p.congTy.diaChi}</div>}
          {p.congTy.maSoThue && <div>MST: {p.congTy.maSoThue}</div>}
        </div>
        <div className="so-in">
          <h2>PHIẾU LƯƠNG</h2>
          <div className="so">Tháng {p.ky}</div>
        </div>
      </header>
      <dl className="khach-in" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><dt>Họ tên:</dt><dd><strong>{p.nguoi.hoTen}</strong></dd></div>
        <div><dt>Mã nhân viên:</dt><dd>{p.nguoi.maNv ?? "—"}</dd></div>
        <div><dt>Chức danh:</dt><dd>{p.nguoi.chucDanh ?? "—"}</dd></div>
        <div><dt>Phòng ban:</dt><dd>{p.nguoi.phongBan ?? "—"}</dd></div>
        <div><dt>Công chuẩn / thực tế / nghỉ có lương / lễ:</dt><dd>{c.chuan} / {c.thucTe} / {c.nghiCoLuong} / {c.le}</dd></div>
        <div><dt>Người phụ thuộc:</dt><dd>{p.dauVao.soNguoiPhuThuoc}</dd></div>
      </dl>
      <table className="bang-in">
        <thead><tr><th>Khoản thu nhập</th><th className="so">Số tiền (đ)</th></tr></thead>
        <tbody>
          {thuNhap.filter(([, v]) => v !== 0).map(([n, v], i) => <tr key={i}><td>{n}</td><td className="so">{d(v)}</td></tr>)}
          <tr><td><strong>Tổng thu nhập</strong></td><td className="so"><strong>{d(k.tongThuNhap)}</strong></td></tr>
        </tbody>
      </table>
      <table className="bang-in">
        <thead><tr><th>Khoản khấu trừ</th><th className="so">Số tiền (đ)</th></tr></thead>
        <tbody>
          {khauTru.filter(([, v]) => v !== 0).map(([n, v], i) => <tr key={i}><td>{n}</td><td className="so">{d(v)}</td></tr>)}
          <tr><td className="mo-ta-in" colSpan={2}>
            Thu nhập chịu thuế {d(k.thuNhapChiuThue)} đ · giảm trừ gia cảnh {d(k.giamTru.tong)} đ · thu nhập tính thuế {d(k.thuNhapTinhThue)} đ
            {k.baoHiem.thamGia ? ` · lương đóng bảo hiểm ${d(k.baoHiem.luongDong)} đ` : " · không đóng bảo hiểm tháng này"}
          </td></tr>
        </tbody>
      </table>
      <div className="tong-in">
        <dl><div className="tong-cong"><dt>THỰC LĨNH</dt><dd>{d(k.thucLinh)} đ</dd></div></dl>
      </div>
      {p.hoaHong.length > 0 && (
        <table className="bang-in">
          <thead><tr><th>Phiếu thu</th><th>Ngày thu</th><th className="so">Tiền thu</th><th className="so">Tỷ lệ</th><th className="so">Hoa hồng</th></tr></thead>
          <tbody>{p.hoaHong.map((h, i) => (
            <tr key={i}><td>{h.soPhieu}{h.loai === "truy-thu" ? " (truy thu)" : ""}</td><td>{h.ngayThu.split("-").reverse().join("/")}</td><td className="so">{d(h.soTien)}</td><td className="so">{h.tyLe}%</td><td className="so">{d(h.hoaHong)}</td></tr>
          ))}</tbody>
        </table>
      )}
      <p className="mo-ta-in">Đi muộn {c.phutMuon} phút, về sớm {c.phutSom} phút — chỉ ghi nhận, không trừ lương. Phiếu lương là thông tin bảo mật.</p>
      <footer className="chan-in">
        <div><div className="nhan-ky">Người lập</div><div className="phu-ky">(Ký, ghi rõ họ tên)</div><div className="cho-ky" /></div>
        <div><div className="phu-ky">{p.ngayIn}</div><div className="nhan-ky">Người lao động</div><div className="phu-ky">(Ký, ghi rõ họ tên)</div><div className="cho-ky" /><div className="ten-ky">{p.nguoi.hoTen}</div></div>
      </footer>
    </article>
  );
}
