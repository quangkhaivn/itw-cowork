import type { KetQuaPhieu, MauPhieu } from "@/modules/danh-gia/tinh-toan";

/**
 * Tờ phiếu đánh giá thực tập khổ A4 (DG-76) — dựng ĐÚNG theo bố cục mẫu đã chụp vào phiếu: quốc hiệu,
 * tên đơn vị, tiêu đề, ô thông tin, các phần tiêu chí (trọng số, thang 10 / thang chữ, điểm), điểm tổng,
 * ô nhận xét, ô ký, ghi chú. Thành phần thuần (không đọc CSDL) để trang in và bài thử dùng chung.
 * In / lưu PDF bằng hộp thoại in của trình duyệt (QĐ-21).
 */
export interface DuLieuPhieuIn {
  mau: MauPhieu;
  thongTin: Record<string, string>;
  ketQua: KetQuaPhieu | null;
  nhanXet: Record<string, string>;
  ngayLap: string;
  banNhap: boolean;
}

const CHAM = "………………………………";

function hienDiem(x: number | null | undefined) {
  return x === null || x === undefined ? "" : x.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export default function PhieuThucTapIn({ d }: { d: DuLieuPhieuIn }) {
  const { mau } = d;
  const chiTiet = new Map((d.ketQua?.chiTiet ?? []).map((c) => [c.ma, c]));
  let stt = 0;
  return (
    <article className="to-in phieu-tt">
      {d.banNhap && <div className="dau-nhap">BẢN NHÁP — CHƯA CHỐT</div>}
      <header className="dau-phieu-tt">
        <div className="don-vi">{mau.tenDonVi ? <strong>{mau.tenDonVi}</strong> : null}</div>
        {mau.quocHieu && (
          <div className="quoc-hieu">
            <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong>
            <div className="tieu-ngu">Độc lập – Tự do – Hạnh phúc</div>
          </div>
        )}
      </header>
      <h2 className="tieu-de-tt">{mau.tieuDe}</h2>
      {mau.tieuDePhu && <p className="tieu-de-phu-tt">{mau.tieuDePhu}</p>}

      {mau.thongTin.length > 0 && (
        <table className="thong-tin-tt">
          <tbody>
            {mau.thongTin.map((t) => (
              <tr key={t.ma}>
                <th>{t.nhan}:</th>
                <td>{d.thongTin[t.ma] || CHAM}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="bang-in bang-tt">
        <thead>
          <tr>
            <th className="giua">STT</th>
            <th>Tiêu chí đánh giá</th>
            <th className="giua">Trọng số</th>
            <th className="giua">Thang</th>
            <th className="giua">Điểm</th>
          </tr>
        </thead>
        <tbody>
          {mau.phan.map((p) => [
            <tr key={`p-${p.ten}`} className="dong-phan">
              <td colSpan={5}>{p.ten}</td>
            </tr>,
            ...p.tieuChi.map((t) => {
              stt += 1;
              const c = chiTiet.get(t.ma);
              const nhap = c?.nhap;
              const hien = t.thang === "chu" ? (nhap !== null && nhap !== undefined && nhap !== "" ? String(nhap) : c?.diem10 !== null && c?.diem10 !== undefined ? `${hienDiem(c.diem10)}*` : "") : hienDiem(c?.diem10);
              return (
                <tr key={t.ma}>
                  <td className="giua">{stt}</td>
                  <td>
                    {t.ten}
                    {t.moTa && <div className="mo-ta-in">{t.moTa}</div>}
                  </td>
                  <td className="giua">{hienDiem(t.trongSo)}</td>
                  <td className="giua">{t.thang === "10" ? "/10" : mau.thangChu.map((x) => x.chu).join(" ")}</td>
                  <td className="giua diem-tt">
                    {hien}
                    {c?.tuDong && <sup title="Lấy tự động từ dữ liệu Cowork"> (tự động)</sup>}
                  </td>
                </tr>
              );
            }),
          ])}
          <tr className="dong-tong">
            <td colSpan={4}>ĐIỂM TỔNG (thang 10, trung bình có trọng số)</td>
            <td className="giua diem-tt">
              {d.ketQua?.tong !== null && d.ketQua?.tong !== undefined ? hienDiem(d.ketQua.tong) : ""}
              {mau.hienChu && d.ketQua?.chu ? ` (${d.ketQua.chu})` : ""}
            </td>
          </tr>
        </tbody>
      </table>
      {mau.phan.some((p) => p.tieuChi.some((t) => t.thang === "chu")) && (
        <p className="ghi-chu-tt">Thang chữ: {mau.thangChu.map((x) => `${x.chu} = ${hienDiem(x.diem)} điểm (từ ${hienDiem(x.tu)})`).join("; ")}.</p>
      )}

      {mau.oNhanXet.map((o) => (
        <section key={o.ma} className="o-nhan-xet-tt">
          <h3>{o.nhan}</h3>
          <div className="noi-dung-nx">{d.nhanXet[o.ma] || <span className="cho-trong">{CHAM}{CHAM}</span>}</div>
        </section>
      ))}

      {mau.ghiChu && <p className="ghi-chu-tt">Ghi chú: {mau.ghiChu}</p>}

      <p className="ngay-lap-tt">{d.ngayLap}</p>
      {mau.oKy.length > 0 && (
        <div className="chan-in">
          {mau.oKy.map((k) => (
            <div key={k.ma}>
              <div className="nhan-ky">{k.nhan}</div>
              {k.ghiChu && <div className="phu-ky">{k.ghiChu}</div>}
              <div className="cho-ky" />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
