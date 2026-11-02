import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgayGio, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { congNgay } from "@/modules/cham-cong/tinh-toan";
import { homNayVN } from "@/modules/crm/chung";
import { bangBaoCaoNhom, baoCaoCuaToi, moBaoCao } from "@/modules/bao-cao-cong-viec/service";
import { NHAN_LOAI_BAO_CAO } from "@/modules/danh-gia/tinh-toan";
import FormBaoCao from "./FormBaoCao";

export const dynamic = "force-dynamic";

const NHAN_TINH_TRANG: Record<string, [string, string]> = {
  "dung-han": ["Đúng hạn", "tot"],
  tre: ["Nộp trễ", "canh-bao"],
  "chua-nop": ["Chưa nộp", ""],
  thieu: ["Thiếu", "loi"],
};
const vn = (s: string) => s.split("-").reverse().join("/");

/** Báo cáo ngày / tuần (DG-40 → DG-45): viết báo cáo của mình + bảng báo cáo cả nhóm cho quản lý. */
export default async function TrangBaoCao({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("danh_gia.view");
  const sp = await searchParams;
  const loai = layMot(sp.loai) === "ngay" ? "ngay" : "tuan";
  const ngay = /^\d{4}-\d{2}-\d{2}$/.test(layMot(sp.ngay)) ? layMot(sp.ngay) : homNayVN();
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      cuaToi: coQuyen(nd.hoSo, "danh_gia.create") ? await moBaoCao(nc, loai, ngay) : null,
      lichSu: coQuyen(nd.hoSo, "danh_gia.create") ? await baoCaoCuaToi(nc, 10) : [],
      nhom: await bangBaoCaoNhom(nc, loai, ngay),
    };
  });
  const buoc = loai === "tuan" ? 7 : 1;
  const nhomKhac = d.nhom.dong.filter((x) => x.nguoiId !== nd.hoSo.userId);
  const so = d.cuaToi?.tuDongMoi.soLieu;
  return (
    <>
      <DauTrang
        tieuDe="Báo cáo công việc"
        moTa="Báo cáo tuần bắt buộc (hạn trong Cấu hình, mặc định thứ Sáu 17:00); báo cáo ngày theo phòng. Máy điền sẵn việc đã xong, đang làm, sắp tới hạn — bạn bổ sung nhận định rồi nộp. Nộp trễ / thiếu được ghi vào đánh giá tháng, không phạt tiền."
      />
      <nav className="thanh-the" aria-label="Loại báo cáo">
        <Link href={`?loai=tuan&ngay=${ngay}`} aria-current={loai === "tuan" ? "page" : undefined}>Báo cáo tuần</Link>
        <Link href={`?loai=ngay&ngay=${ngay}`} aria-current={loai === "ngay" ? "page" : undefined}>Báo cáo ngày</Link>
      </nav>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
        <Link className="nut nho" href={`?loai=${loai}&ngay=${congNgay(ngay, -buoc)}`}>‹ Kỳ trước</Link>
        <strong>{loai === "tuan" ? `Tuần ${vn(d.nhom.tu)} – ${vn(d.nhom.den)}` : `Ngày ${vn(d.nhom.tu)}`}</strong>
        <span className="phu">Hạn nộp {dinhDangNgayGio(d.nhom.han)}</span>
        {ngay < homNayVN() && <Link className="nut nho" href={`?loai=${loai}&ngay=${congNgay(ngay, buoc)}`}>Kỳ sau ›</Link>}
      </div>

      {d.cuaToi && (
        <section className="the">
          <div className="dau">
            <h2>{NHAN_LOAI_BAO_CAO[loai]} của tôi</h2>
            {d.cuaToi.trangThai === "da-nop" ? (
              <span className={`huy-hieu ${d.cuaToi.tre ? "canh-bao" : "tot"}`}>Đã nộp {d.cuaToi.nopLuc ? dinhDangNgayGio(d.cuaToi.nopLuc) : ""}{d.cuaToi.tre ? " — trễ hạn" : ""}</span>
            ) : (
              <span className="huy-hieu">{d.cuaToi.daLuu ? "Bản nháp" : "Chưa viết — máy đã điền sẵn"}</span>
            )}
          </div>
          {so && (so.doanhThuDaThu || so.phieuHoTroXong || so.tongDiemViec || so.leadXuLy) ? (
            <p className="phu nho" style={{ margin: "0 0 8px" }}>
              Số liệu tự tính kỳ này:{so.doanhThuDaThu ? ` doanh số đã thu ${dinhDangTien(so.doanhThuDaThu)};` : ""}{so.phieuHoTroXong ? ` phiếu hỗ trợ xong ${so.phieuHoTroXong};` : ""}{so.leadXuLy ? ` lead đã xử lý ${so.leadXuLy};` : ""}{so.tongDiemViec ? ` điểm việc ${so.tongDiemViec}.` : ""}
            </p>
          ) : null}
          <FormBaoCao loai={loai} ngay={ngay} daLam={d.cuaToi.daLam} seLam={d.cuaToi.seLam} vuongMac={d.cuaToi.vuongMac} khoa={d.cuaToi.trangThai === "da-nop"} />
          {d.cuaToi.id && <p className="nho"><Link href={`/bao-cao-cong-viec/${d.cuaToi.id}`}>Xem nhận xét của quản lý</Link></p>}
        </section>
      )}

      {nhomKhac.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Báo cáo của nhóm</h2></div>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Người</th><th>Tình trạng</th><th>Nộp lúc</th><th>Vướng mắc</th><th className="so">Nhận xét</th><th /></tr></thead>
            <tbody>{nhomKhac.map((x) => {
              const [nhan, lop] = NHAN_TINH_TRANG[x.tinhTrang] ?? [x.tinhTrang, ""];
              return (
                <tr key={x.nguoiId}>
                  <td>{x.hoTen}{!x.batBuoc && <span className="phu nho"> (không bắt buộc)</span>}</td>
                  <td><span className={`huy-hieu ${lop}`}>{x.baoCao?.trangThai === "nhap" ? "Đang viết" : nhan}</span></td>
                  <td>{x.baoCao?.nopLuc ? dinhDangNgayGio(x.baoCao.nopLuc) : "—"}</td>
                  <td style={{ maxWidth: 360 }}>{x.baoCao?.trangThai === "da-nop" ? (x.baoCao.vuongMac || <span className="phu">—</span>) : ""}</td>
                  <td className="so">{x.soNhanXet}</td>
                  <td>{x.baoCao?.trangThai === "da-nop" && <Link href={`/bao-cao-cong-viec/${x.baoCao.id}`}>Mở</Link>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}

      {d.lichSu.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Báo cáo gần đây của tôi</h2></div>
          {d.lichSu.length === 0 ? <TrongRong tieuDe="Chưa có" /> : (
            <ul>{d.lichSu.map((r) => (
              <li key={r.id}>
                <Link href={`/bao-cao-cong-viec/${r.id}`}>{NHAN_LOAI_BAO_CAO[r.loai]} {r.tu === r.den ? vn(r.tu) : `${vn(r.tu)} – ${vn(r.den)}`}</Link>{" "}
                <span className={`huy-hieu ${NHAN_TINH_TRANG[r.tinhTrang]?.[1] ?? ""}`}>{r.trangThai === "nhap" ? "Nháp" : NHAN_TINH_TRANG[r.tinhTrang]?.[0]}</span>
              </li>
            ))}</ul>
          )}
        </section>
      )}
    </>
  );
}
