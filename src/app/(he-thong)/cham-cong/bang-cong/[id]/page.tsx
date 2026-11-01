import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { chiTietBangCong } from "@/modules/cham-cong/bang-cong";
import { NHAN_LOAI_NGAY } from "@/modules/cham-cong/tinh-toan";
import TacVuBangCong from "../TacVuBangCong";
import GiaiQuyet from "./GiaiQuyet";

export const dynamic = "force-dynamic";

const gio = (p: number) => (p / 60).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const gioPhut = (d: Date | null) => (d ? new Date(d).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "—");

export default async function TrangChiTietBangCong({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("cham_cong.view");
  const { id } = await params;
  const sp = await searchParams;
  const nguoiId = /^[0-9a-f-]{36}$/i.test(layMot(sp.nguoi)) ? layMot(sp.nguoi) : null;
  const b = await docDuLieu(nd, (tx) => chiTietBangCong(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id, nguoiId));
  const nhap = b.trangThai === "nhap";
  const coDongCuaToi = b.dong.some((r) => r.userId === nd.hoSo.userId);
  const dong = nguoiId ? b.dong : b.dong.filter((r) => b.tongHop.length === 1 || r.co.length > 0 || r.laDieuChinh);

  return (
    <>
      <DauTrang
        tieuDe={`Bảng công tháng ${b.thang}/${b.nam}`}
        duongDan={[{ nhan: "Nhân sự" }, { nhan: "Bảng công tháng", href: "/cham-cong/bang-cong" }]}
        moTa={
          nhap
            ? `Nháp — sinh lúc ${dinhDangNgayGio(b.sinhLuc)}${b.nguoiSinh ? ` bởi ${b.nguoiSinh}` : ""}. ${b.conHanPhanHoi ? `Hạn phản hồi: ${dinhDangNgayGio(b.hanPhanHoi)}.` : "Đã hết hạn phản hồi."}`
            : `Đã khóa lúc ${dinhDangNgayGio(b.khoaLuc)}${b.nguoiKhoa ? ` bởi ${b.nguoiKhoa}` : ""} — không sửa được.`
        }
        hanhDong={
          <>
            {nhap && b.conHanPhanHoi && coDongCuaToi && <TacVuBangCong cheDo="phan-hoi" bang={{ id: b.id, nam: b.nam, thang: b.thang }} />}
            {nhap && b.duocQuanLy && <TacVuBangCong cheDo="sinh-lai" bang={{ id: b.id, nam: b.nam, thang: b.thang }} />}
            {b.duocXuat && (
              <>
                <a className="nut" href={`/api/v1/cham-cong/bang-cong/${b.id}/csv?kieu=tong-hop`}>CSV tổng hợp</a>
                <a className="nut" href={`/api/v1/cham-cong/bang-cong/${b.id}/csv?kieu=chi-tiet`}>CSV chi tiết</a>
              </>
            )}
            {nhap && b.duocQuanLy && <TacVuBangCong cheDo="khoa" bang={{ id: b.id, nam: b.nam, thang: b.thang }} />}
          </>
        }
      />

      <section className="the">
        <div className="dau"><h2>Tổng hợp theo người</h2></div>
        {b.tongHop.length === 0 ? <TrongRong tieuDe="Không có dòng công nào trong phạm vi bạn xem được" /> : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Nhân viên</th><th className="so">Công dự kiến</th><th className="so">Công thực tế</th><th className="so">Nghỉ có lương</th><th className="so">Nghỉ không lương</th>
                  <th className="so">Đi muộn (lần / phút)</th><th className="so">Về sớm (lần / phút)</th><th className="so">TC thường (giờ)</th><th className="so">TC nghỉ tuần</th><th className="so">TC lễ</th><th className="so">Trong đó đêm</th><th className="so">Ngày có cờ</th>
                </tr>
              </thead>
              <tbody>
                {b.tongHop.map((t) => (
                  <tr key={t.userId}>
                    <td><a href={`?nguoi=${t.userId}`}>{t.hoTen}</a>{t.soDongDieuChinh > 0 && <span className="huy-hieu canh-bao"> {t.soDongDieuChinh} điều chỉnh</span>}</td>
                    <td className="so">{t.congDuKien}</td><td className="so">{t.congThucTe}</td><td className="so">{t.nghiCoLuong}</td><td className="so">{t.nghiKhongLuong}</td>
                    <td className="so">{t.soLanMuon} / {t.phutMuon}</td><td className="so">{t.soLanSom} / {t.phutSom}</td>
                    <td className="so">{gio(t.tangCaThuongPhut)}</td><td className="so">{gio(t.tangCaNghiTuanPhut)}</td><td className="so">{gio(t.tangCaLePhut)}</td><td className="so">{gio(t.tangCaDemPhut)}</td>
                    <td className="so">{t.soNgayCo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="the">
        <div className="dau">
          <h2>{nguoiId ? "Chi tiết từng ngày" : b.tongHop.length === 1 ? "Từng ngày" : "Ngày có cờ / điều chỉnh"}</h2>
          {nguoiId && <a className="nut nho" href="?">Bỏ lọc</a>}
        </div>
        {dong.length === 0 ? <p className="phu">Không có dòng nào cần chú ý. Bấm tên một người để xem từng ngày.</p> : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead><tr><th>Nhân viên</th><th>Ngày</th><th>Loại ngày</th><th className="so">Dự kiến</th><th className="so">Thực tế</th><th>Vào</th><th>Ra</th><th>Nguồn</th><th className="so">Muộn</th><th className="so">Sớm</th><th className="so">Nghỉ</th><th className="so">TC (giờ)</th><th>Cờ</th></tr></thead>
              <tbody>
                {dong.map((r) => (
                  <tr key={r.id} className={r.laDieuChinh ? "mo" : undefined}>
                    <td>{r.hoTen}</td>
                    <td>{r.ngay.split("-").reverse().join("/")}{r.laDieuChinh && <span className="huy-hieu canh-bao"> điều chỉnh</span>}</td>
                    <td>{NHAN_LOAI_NGAY[r.loaiNgay]}</td>
                    <td className="so">{r.congDuKien}</td><td className="so">{r.congThucTe}</td>
                    <td>{gioPhut(r.vaoDau)}</td><td>{gioPhut(r.raCuoi)}</td><td>{r.nguon.join(", ")}</td>
                    <td className="so">{r.phutMuon || ""}</td><td className="so">{r.phutSom || ""}</td><td className="so">{r.nghiNgay || ""}{r.maLoaiNghi ? ` ${r.maLoaiNghi}` : ""}</td>
                    <td className="so">{r.phutTangCa ? gio(r.phutTangCa) : ""}</td>
                    <td>{r.nhanCo.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="the">
        <div className="dau"><h2>Phản hồi ({b.phanHoi.length})</h2></div>
        {b.phanHoi.length === 0 ? <p className="phu">Chưa có phản hồi.</p> : (
          <ul className="ds-lan-cham">
            {b.phanHoi.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{p.nguoi.hoTen}</strong>{p.ngay && ` · ngày ${p.ngay.split("-").reverse().join("/")}`}: {p.noiDung}
                  {p.giaiQuyet && <div className="phu nho">Giải quyết ({p.nguoiGiaiQuyet}): {p.giaiQuyet}</div>}
                </span>
                <span>
                  <span className={`huy-hieu ${p.trangThai === "mo" ? "canh-bao" : "tot"}`}>{p.trangThai === "mo" ? "Chưa giải quyết" : "Đã giải quyết"}</span>{" "}
                  {p.trangThai === "mo" && nhap && b.duocQuanLy && <GiaiQuyet id={p.id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
