import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachGiaiTrinh, danhSachTangCa, NHAN_TRANG_THAI_DON } from "@/modules/cham-cong/don-tu";
import { danhSachLoaiNghi } from "@/modules/nhan-su/service";
import { danhSachDonNghi, lichNghiThang, soDuPhepCua } from "@/modules/nghi-phep/service";
import { ngayVNCua, thuTrongTuan } from "@/modules/cham-cong/tinh-toan";
import NutQuyetDinh from "./NutQuyetDinh";
import TaoDon from "./TaoDon";

export const dynamic = "force-dynamic";

const LOP: Record<string, string> = { "cho-duyet": "canh-bao", "da-duyet": "tot", "tu-choi": "loi", "da-huy": "" };
const PHAN: Record<string, string> = { "ca-ngay": "", sang: " (sáng)", chieu: " (chiều)" };
const ngayVN = (s: string) => s.split("-").reverse().join("/");

/** Đơn từ chấm công: nghỉ phép, tăng ca, giải trình — của tôi, chờ tôi duyệt, lịch nghỉ của nhóm. */
export default async function TrangDonTu({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("cham_cong.view");
  const sp = await searchParams;
  const homNay = ngayVNCua(new Date());
  const namHt = Number(homNay.slice(0, 4));
  const thang = /^\d{4}-\d{2}$/.test(layMot(sp.thang)) ? layMot(sp.thang) : homNay.slice(0, 7);
  const [nam, th] = thang.split("-").map(Number);
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      loaiNghi: await danhSachLoaiNghi(nc),
      soDu: await soDuPhepCua(nc, null, namHt),
      nghiCuaToi: await danhSachDonNghi(nc, "cua-toi"),
      nghiChoDuyet: await danhSachDonNghi(nc, "cho-toi-duyet"),
      nghiNhom: await danhSachDonNghi(nc, "tat-ca", "da-duyet"),
      tcCuaToi: await danhSachTangCa(nc, { loai: "cua-toi", trangThai: "" }),
      tcChoDuyet: await danhSachTangCa(nc, { loai: "cho-toi-duyet", trangThai: "" }),
      gtCuaToi: await danhSachGiaiTrinh(nc, { loai: "cua-toi", trangThai: "" }),
      gtChoDuyet: await danhSachGiaiTrinh(nc, { loai: "cho-toi-duyet", trangThai: "" }),
      lich: await lichNghiThang(nc, nam, th),
    };
  });
  const choDuyet = [
    ...d.nghiChoDuyet.filter((x) => x.duocDuyet).map((x) => ({ id: x.id, loai: "Nghỉ", nguoi: x.nguoi.hoTen, noiDung: `${x.loai}: ${ngayVN(x.tuNgay)}${x.denNgay !== x.tuNgay ? ` → ${ngayVN(x.denNgay)}` : ""}${PHAN[x.phan]} · ${x.soNgay} ngày`, lyDo: x.lyDo, url: `/api/v1/cham-cong/nghi-phep/${x.id}`, soGio: undefined as number | undefined })),
    ...d.tcChoDuyet.filter((x) => x.duocDuyet).map((x) => ({ id: x.id, loai: "Tăng ca", nguoi: x.nguoi.hoTen, noiDung: `${ngayVN(x.ngay)} · ${x.soGio} giờ`, lyDo: x.lyDo, url: `/api/v1/cham-cong/tang-ca/${x.id}`, soGio: x.soGio })),
    ...d.gtChoDuyet.filter((x) => x.duocDuyet).map((x) => ({ id: x.id, loai: "Chấm bù", nguoi: x.nguoi.hoTen, noiDung: `${x.huong === "vao" ? "Giờ vào" : "Giờ ra"} ${dinhDangNgayGio(x.luc)}`, lyDo: x.lyDo, url: `/api/v1/cham-cong/giai-trinh/${x.id}`, soGio: undefined })),
  ];
  const nguoiLich = [...new Map(d.lich.dong.map((r) => [r.nguoi.id, r.nguoi.hoTen])).entries()];
  const thangTruoc = new Date(Date.UTC(nam, th - 2, 1)).toISOString().slice(0, 7);
  const thangSau = new Date(Date.UTC(nam, th, 1)).toISOString().slice(0, 7);

  return (
    <>
      <DauTrang
        tieuDe="Đơn từ"
        duongDan={[{ nhan: "Nhân sự" }, { nhan: "Chấm công", href: "/cham-cong" }]}
        moTa="Xin nghỉ, xin tăng ca, giải trình quên chấm công. Quản lý trực tiếp hoặc bộ phận Nhân sự duyệt."
        hanhDong={<TaoDon loaiNghi={d.loaiNghi.map((l) => ({ id: l.id, ten: l.ten, truPhepNam: l.truPhepNam }))} />}
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Phép năm còn được dùng ({d.soDu.nam})</div>
          <div className="gia-tri">{d.soDu.duocDung.toLocaleString("vi-VN")}</div>
          <div className="ghi-chu">
            Quỹ năm {d.soDu.quyNam} · đã dùng {d.soDu.daDung} · đang chờ {d.soDu.dangCho}
            {d.soDu.chuyenSang ? ` · chuyển sang ${d.soDu.chuyenSang}` : ""}{d.soDu.dieuChinh ? ` · điều chỉnh ${d.soDu.dieuChinh}` : ""}
            {d.soDu.congDonTheoThang ? " · tích lũy theo tháng" : ""}
          </div>
        </div>
        <div className={`the chi-so ${choDuyet.length ? "canh-bao" : ""}`}>
          <div className="nhan">Chờ tôi duyệt</div>
          <div className="gia-tri">{choDuyet.length}</div>
        </div>
      </div>

      {choDuyet.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Chờ tôi duyệt</h2></div>
          <div className="cuon-ngang">
            <table className="bang">
              <thead><tr><th>Loại</th><th>Người xin</th><th>Nội dung</th><th>Lý do</th><th /></tr></thead>
              <tbody>
                {choDuyet.map((x) => (
                  <tr key={x.id}>
                    <td>{x.loai}</td><td>{x.nguoi}</td><td>{x.noiDung}</td><td>{x.lyDo}</td>
                    <td><NutQuyetDinh url={x.url} duocDuyet duocHuy={false} soGioXin={x.soGio} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="the">
        <div className="dau"><h2>Đơn nghỉ của tôi</h2></div>
        {d.nghiCuaToi.length === 0 ? <TrongRong tieuDe="Chưa có đơn nghỉ nào" /> : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead><tr><th>Loại</th><th>Thời gian</th><th className="so">Số ngày</th><th>Trạng thái</th><th>Ghi chú</th><th /></tr></thead>
              <tbody>
                {d.nghiCuaToi.map((x) => (
                  <tr key={x.id}>
                    <td>{x.loai}</td>
                    <td>{ngayVN(x.tuNgay)}{x.denNgay !== x.tuNgay ? ` → ${ngayVN(x.denNgay)}` : ""}{PHAN[x.phan]}</td>
                    <td className="so">{x.soNgay}</td>
                    <td><span className={`huy-hieu ${LOP[x.trangThai]}`}>{NHAN_TRANG_THAI_DON[x.trangThai]}</span>{x.nguoiDuyet && <div className="phu nho">{x.nguoiDuyet}</div>}</td>
                    <td>{x.ghiChu ?? ""}</td>
                    <td><NutQuyetDinh url={`/api/v1/cham-cong/nghi-phep/${x.id}`} duocDuyet={false} duocHuy={x.duocHuy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="the">
        <div className="dau"><h2>Tăng ca của tôi</h2></div>
        {d.tcCuaToi.length === 0 ? <TrongRong tieuDe="Chưa có đơn tăng ca nào" /> : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead><tr><th>Ngày</th><th className="so">Xin</th><th className="so">Duyệt</th><th className="so">Thực tế được tính</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {d.tcCuaToi.map((x) => (
                  <tr key={x.id}>
                    <td>{ngayVN(x.ngay)}</td>
                    <td className="so">{x.soGio} giờ</td>
                    <td className="so">{x.gioDuyet ?? "—"}</td>
                    <td className="so">{x.thucTe ? `${(x.thucTe.phut / 60).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} giờ${x.thucTe.phutDem ? ` (đêm ${(x.thucTe.phutDem / 60).toLocaleString("vi-VN", { maximumFractionDigits: 2 })})` : ""}` : "—"}</td>
                    <td><span className={`huy-hieu ${LOP[x.trangThai]}`}>{NHAN_TRANG_THAI_DON[x.trangThai]}</span></td>
                    <td><NutQuyetDinh url={`/api/v1/cham-cong/tang-ca/${x.id}`} duocDuyet={false} duocHuy={x.duocHuy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="the">
        <div className="dau"><h2>Giải trình / chấm bù của tôi</h2></div>
        {d.gtCuaToi.length === 0 ? <TrongRong tieuDe="Chưa có giải trình nào" /> : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead><tr><th>Ngày công</th><th>Giờ xin chấm</th><th>Lý do</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {d.gtCuaToi.map((x) => (
                  <tr key={x.id}>
                    <td>{ngayVN(x.ngay)}</td>
                    <td>{x.huong === "vao" ? "Vào" : "Ra"} {dinhDangNgayGio(x.luc)}</td>
                    <td>{x.lyDo}</td>
                    <td><span className={`huy-hieu ${LOP[x.trangThai]}`}>{NHAN_TRANG_THAI_DON[x.trangThai]}</span>{x.ghiChu && <div className="phu nho">{x.ghiChu}</div>}</td>
                    <td><NutQuyetDinh url={`/api/v1/cham-cong/giai-trinh/${x.id}`} duocDuyet={false} duocHuy={x.duocHuy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="the">
        <div className="dau">
          <h2>Lịch nghỉ tháng {th}/{nam}</h2>
          <span className="loc-gon">
            <Link className="nut nho" href={`?thang=${thangTruoc}`}>‹ Tháng trước</Link>
            <Link className="nut nho" href={`?thang=${thangSau}`}>Tháng sau ›</Link>
          </span>
        </div>
        {nguoiLich.length === 0 ? <p className="phu">Không có ai nghỉ trong tháng (trong phạm vi bạn xem được).</p> : (
          <div className="cuon-ngang">
            <table className="lich-nghi">
              <thead>
                <tr><th>Người</th>{d.lich.ngays.map((n) => <th key={n} className={thuTrongTuan(n) >= 5 ? "phu" : undefined}>{Number(n.slice(8))}</th>)}</tr>
              </thead>
              <tbody>
                {nguoiLich.map(([id, ten]) => (
                  <tr key={id}>
                    <td className="ten">{ten}</td>
                    {d.lich.ngays.map((n) => {
                      const r = d.lich.dong.find((x) => x.nguoi.id === id && x.tuNgay <= n && x.denNgay >= n);
                      return <td key={n} className={r ? (r.trangThai === "da-duyet" ? "nghi" : "cho") : undefined} title={r ? `${r.loai}${PHAN[r.phan]} — ${NHAN_TRANG_THAI_DON[r.trangThai]}` : undefined}>{r ? (r.phan === "ca-ngay" ? "●" : "◐") : ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="phu nho">● nghỉ cả ngày · ◐ nửa ngày · nền vàng = đã duyệt, nền xanh = đang chờ duyệt. Đơn đã duyệt gần đây trong phạm vi: {d.nghiNhom.length}. Cập nhật {dinhDangNgay(new Date())}.</p>
          </div>
        )}
      </section>
    </>
  );
}
