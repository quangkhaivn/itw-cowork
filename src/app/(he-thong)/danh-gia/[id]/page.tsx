import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import NutHanhDong from "@/components/danh-gia/NutHanhDong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietPhieu } from "@/modules/danh-gia/service";
import ChamPhieu from "./ChamPhieu";

export const dynamic = "force-dynamic";

const NHAN_BUOC: Record<string, string> = { "nhan-vien": "Chờ tự đánh giá", "quan-ly": "Chờ quản lý chấm", "cho-chot": "Chờ chốt", "da-chot": "Đã chốt" };

type BoiCanh = {
  baoCaoTuan?: { batBuoc: boolean; soTuan: number; dungHan: number; tre: number; thieu: number };
  cong?: { congDuKien: number; congThucTe: number; ngayNghiPhep: number; phutDiMuon: number; phutVeSom: number; ngayVang: number; tyLeChuyenCan: number | null } | null;
  viec?: { tongDiem: number | null; tyLeDungHan: number | null; tyLeTraLai: number | null };
};

/** Một phiếu đánh giá (DG-61 → DG-68). */
export default async function TrangPhieuDanhGia({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("danh_gia.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietPhieu(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (e) {
      if (e instanceof LoiKhongTimThay) return null;
      throw e;
    }
  });
  if (!d) notFound();
  const p = d.phieu;
  const bc = p.boiCanh as BoiCanh;
  const kq = p.hieuLuc ?? null;
  return (
    <>
      <DauTrang
        tieuDe={`${p.hoTen} — ${p.ky}`}
        duongDan={[{ nhan: "Đánh giá nhân viên", href: "/danh-gia" }, { nhan: p.ky, href: `/danh-gia/ky/${p.kyId}` }]}
        moTa={<><span className={`huy-hieu ${p.trangThai === "da-chot" ? "tot" : "canh-bao"}`}>{NHAN_BUOC[p.trangThai]}</span> Bộ KPI: {p.boKpi ?? "Đánh giá chung"} · Quản lý: {p.quanLy ?? "—"}</>}
        hanhDong={
          <span style={{ display: "flex", gap: 6 }}>
            {d.quyen.lamMoi && <NutHanhDong url={`/api/v1/danh-gia/${id}/lam-moi`} nhan="Làm mới số liệu" />}
            {d.quyen.chot && (
              <FormNhanh nhanNut="Chốt kết quả" tieuDe="Chốt phiếu đánh giá" url={`/api/v1/danh-gia/${id}/chot`} lopNut="nut chinh"
                truong={[{ ten: "ghiChu", nhan: "Ghi chú khi chốt", kieu: "textarea", caDong: true, goiY: `Tạm tính: ${p.tamTinh ? `${p.tamTinh.tongDiem} điểm → loại ${p.tamTinh.loai}, hệ số ${p.tamTinh.heSoThuong}` : "chưa đủ điểm"}. Chốt rồi không sửa được (chỉ điều chỉnh có lý do).` }]} />
            )}
          </span>
        }
      />
      <div className="luoi-chi-so">
        <div className={`the chi-so ${kq ? "tot" : ""}`}>
          <div className="nhan">{kq ? "Kết quả" : "Tạm tính"}</div>
          <div className="gia-tri">{kq ? kq.tongDiem : (p.tamTinh?.tongDiem ?? "—")}</div>
          <div className="ghi-chu">{kq ? `Loại ${kq.xepLoai} · hệ số thưởng ${kq.heSoThuong}` : p.tamTinh ? `Loại ${p.tamTinh.loai} nếu chốt bây giờ` : `Còn ${p.thieuDiem} chỉ tiêu chưa có điểm`}</div>
        </div>
        {bc.baoCaoTuan && (
          <div className={`the chi-so ${bc.baoCaoTuan.thieu ? "loi" : bc.baoCaoTuan.tre ? "canh-bao" : ""}`}>
            <div className="nhan">Báo cáo tuần</div>
            <div className="gia-tri" style={{ fontSize: 16 }}>{bc.baoCaoTuan.batBuoc ? `${bc.baoCaoTuan.dungHan}/${bc.baoCaoTuan.soTuan} đúng hạn` : "Không bắt buộc"}</div>
            <div className="ghi-chu">{bc.baoCaoTuan.tre} trễ · {bc.baoCaoTuan.thieu} thiếu</div>
          </div>
        )}
        <div className="the chi-so">
          <div className="nhan">Chấm công (bảng công 0.19)</div>
          <div className="gia-tri" style={{ fontSize: 16 }}>{bc.cong ? `${dinhDangSo(bc.cong.congThucTe)}/${dinhDangSo(bc.cong.congDuKien)} công` : "Chưa có bảng công"}</div>
          <div className="ghi-chu">{bc.cong ? `Chuyên cần ${bc.cong.tyLeChuyenCan ?? "—"}% · nghỉ phép ${bc.cong.ngayNghiPhep} · vắng ${bc.cong.ngayVang} · muộn ${bc.cong.phutDiMuon} phút` : ""}</div>
        </div>
        {bc.viec && (
          <div className="the chi-so">
            <div className="nhan">Công việc trong kỳ</div>
            <div className="gia-tri" style={{ fontSize: 16 }}>{bc.viec.tongDiem ?? 0} điểm</div>
            <div className="ghi-chu">Đúng hạn {bc.viec.tyLeDungHan ?? "—"}% · bị trả lại {bc.viec.tyLeTraLai ?? "—"}%</div>
          </div>
        )}
      </div>

      <section className="the">
        <div className="dau"><h2>Chỉ tiêu</h2><span className="phu nho">Số liệu tính lúc {p.soLieuLuc ? dinhDangNgayGio(p.soLieuLuc) : "—"} · trần % đạt {d.tranPhanTram}%</span></div>
        <div className="cuon-ngang"><table className="bang">
          <thead><tr><th>Chỉ tiêu</th><th className="so">Trọng số</th><th className="so">Mục tiêu</th><th className="so">Thực tế</th><th className="so">% đạt</th><th className="so">Tự chấm</th><th className="so">Quản lý chấm</th><th className="so">Điểm</th></tr></thead>
          <tbody>{d.chiTieu.map((c) => (
            <tr key={c.id}>
              <td>{c.ten}{c.nguon === "tu-dong" ? <span className="huy-hieu">tự tính</span> : <span className="huy-hieu">quản lý chấm</span>}
                {c.tuGhiChu && <div className="dong-phu">Giải trình: {c.tuGhiChu}</div>}{c.quanLyGhiChu && <div className="dong-phu">Quản lý: {c.quanLyGhiChu}</div>}</td>
              <td className="so">{c.trongSo}</td>
              <td className="so">{c.mucTieu !== null ? `${dinhDangSo(c.mucTieu)} ${c.donVi}` : "—"}</td>
              <td className="so">{c.thucTe !== null ? `${dinhDangSo(c.thucTe)} ${c.donVi}` : "—"}</td>
              <td className="so">{c.phanTramDat ?? "—"}</td><td className="so">{c.tuCham ?? "—"}</td><td className="so">{c.quanLyCham ?? "—"}</td>
              <td className="so"><strong>{c.diem ?? "—"}</strong></td>
            </tr>
          ))}</tbody>
        </table></div>
        {p.tuNhanXet && <p><strong>Nhân viên tự nhận xét:</strong> {p.tuNhanXet}</p>}
        {p.nhanXetQuanLy && <p><strong>Nhận xét của quản lý{p.nguoiCham ? ` (${p.nguoiCham})` : ""}:</strong> {p.nhanXetQuanLy}</p>}
        {p.trangThai === "da-chot" && <p className="phu">Chốt bởi {p.nguoiChot} lúc {p.chotLuc ? dinhDangNgayGio(p.chotLuc) : ""}{p.ghiChuChot ? ` — ${p.ghiChuChot}` : ""}.</p>}
      </section>

      {d.quyen.tuDanhGia && (
        <section className="the"><div className="dau"><h2>Tự đánh giá</h2></div><ChamPhieu id={id} che="tu" chiTieu={d.chiTieu} ghiChuDau={p.tuNhanXet} /></section>
      )}
      {d.quyen.quanLyCham && (
        <section className="the"><div className="dau"><h2>Quản lý chấm</h2></div><ChamPhieu id={id} che="quan-ly" chiTieu={d.chiTieu} ghiChuDau={p.nhanXetQuanLy} /></section>
      )}
      {d.quyen.dieuChinh && (
        <section className="the"><div className="dau"><h2>Điều chỉnh sau khi chốt</h2></div><ChamPhieu id={id} che="dieu-chinh" chiTieu={d.chiTieu} ghiChuDau="" /></section>
      )}
      {d.dieuChinh.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Lịch sử điều chỉnh</h2></div>
          <ul>{d.dieuChinh.map((a) => (
            <li key={a.id}>{dinhDangNgayGio(a.luc)} — {a.nguoi}: {a.tongCu ?? "—"} ({a.loaiCu}) → <strong>{a.tongMoi} ({a.loaiMoi})</strong>, hệ số {a.heSoMoi}. Lý do: {a.lyDo}</li>
          ))}</ul>
        </section>
      )}
      <p className="nho"><Link href="/bao-cao-cong-viec">Xem báo cáo công việc</Link></p>
    </>
  );
}
