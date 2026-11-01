import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachHoSoNhanSu } from "@/modules/nhan-su/service";
import { LOAI_NHAN_SU, NHAN_LOAI_NHAN_SU } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

/** Hồ sơ nhân sự mở rộng (NS-01 → NS-03): loại nhân sự, mã chấm công, địa điểm, lịch, hợp đồng. */
export default async function TrangHoSoNhanSu({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("nhan_su.view");
  const sp = await searchParams;
  const q = layMot(sp.q).slice(0, 100);
  const loai = (LOAI_NHAN_SU as readonly string[]).includes(layMot(sp.loai)) ? layMot(sp.loai) : "";
  const ds = await docDuLieu(nd, (tx) => danhSachHoSoNhanSu(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), { q, loai }));
  const chuaPin = ds.filter((x) => !x.maChamCong).length;
  const chuaLich = ds.filter((x) => !x.lichHienTai).length;
  return (
    <>
      <DauTrang
        tieuDe="Hồ sơ nhân sự"
        duongDan={[{ nhan: "Nhân sự" }]}
        moTa={<>Tài khoản, phòng ban, quản lý trực tiếp sửa ở <Link href="/quan-tri/nguoi-dung">Quản trị → Người dùng</Link>. Ở đây: loại nhân sự, mã chấm công, địa điểm mặc định, thực tập, hợp đồng lao động.</>}
      />
      {(chuaPin > 0 || chuaLich > 0) && (
        <div className="hop-thong-bao canh-bao">{chuaPin > 0 && `${chuaPin} người chưa có mã chấm công (máy vân tay không nhận ra). `}{chuaLich > 0 && `${chuaLich} người chưa được gán lịch làm (không tính công, không nhắc chấm).`}</div>
      )}
      <form className="bo-loc the" method="get">
        <div className="truong rong"><label htmlFor="hs-q">Tìm</label><input id="hs-q" name="q" defaultValue={q} placeholder="Tên, email, mã chấm công" /></div>
        <div className="truong">
          <label htmlFor="hs-loai">Loại nhân sự</label>
          <select id="hs-loai" name="loai" defaultValue={loai}>
            <option value="">Tất cả</option>
            {LOAI_NHAN_SU.map((l) => <option key={l} value={l}>{NHAN_LOAI_NHAN_SU[l]}</option>)}
          </select>
        </div>
        <button className="nut" type="submit" style={{ alignSelf: "end" }}>Lọc</button>
      </form>
      <section className="the">
        {ds.length === 0 ? <TrongRong tieuDe="Không có ai khớp bộ lọc" /> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Họ tên</th><th>Loại</th><th>Mã chấm công</th><th>Phòng ban</th><th>Quản lý trực tiếp</th><th>Địa điểm</th><th>Lịch hiện tại</th><th>Vào làm</th><th className="so">Hợp đồng</th></tr></thead>
            <tbody>{ds.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/nhan-su/ho-so/${x.id}`}>{x.hoTen}</Link><div className="phu nho">{x.chucDanh ?? x.email}</div></td>
                <td>{NHAN_LOAI_NHAN_SU[x.loaiNhanSu as keyof typeof NHAN_LOAI_NHAN_SU] ?? x.loaiNhanSu}</td>
                <td>{x.maChamCong ? <code>{x.maChamCong}</code> : <span className="huy-hieu canh-bao">Chưa có</span>}</td>
                <td>{x.phongBan?.name ?? "—"}</td><td>{x.quanLy?.hoTen ?? "—"}</td><td>{x.diaDiem?.ten ?? "—"}</td>
                <td>{x.lichHienTai ?? <span className="huy-hieu canh-bao">Chưa gán</span>}</td>
                <td>{x.ngayVaoLam ? dinhDangNgay(x.ngayVaoLam) : "—"}</td><td className="so">{x.soHopDong}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
