import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { homNayVN } from "@/modules/crm/chung";
import { dauTuan } from "@/modules/danh-gia/tinh-toan";
import { danhSachMauPhieu, danhSachNhatKy, danhSachPhieuThucTap, danhSachThucTapSinh } from "@/modules/thuc-tap/service";
import FormNhatKy from "./FormNhatKy";

export const dynamic = "force-dynamic";

const vn = (s: string) => (s ? s.split("-").reverse().join("/") : "");

/** Sinh viên thực tập (DG-70 → DG-76): nhật ký tuần, nhận xét, phiếu đánh giá theo mẫu. */
export default async function TrangThucTap({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("danh_gia.view");
  const sp = await searchParams;
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const laTt = (await tx.staffProfile.findFirst({ where: { userId: nd.hoSo.userId }, select: { staffType: true } }))?.staffType === "thuc-tap";
    const ds = await danhSachThucTapSinh(nc);
    const nguoi = /^[0-9a-f-]{36}$/i.test(layMot(sp.nguoi)) ? layMot(sp.nguoi) : laTt ? nd.hoSo.userId : (ds[0]?.id ?? null);
    return {
      laTt,
      ds,
      nguoi,
      nhatKy: nguoi ? await danhSachNhatKy(nc, nguoi) : null,
      phieu: await danhSachPhieuThucTap(nc),
      mau: coQuyen(nd.hoSo, "nhan_su.view") || ds.length ? (await danhSachMauPhieu(nc)).filter((m) => m.trangThai === "hoat-dong") : [],
    };
  });
  const tuanNay = dauTuan(homNayVN());
  const cuaTuanNay = d.laTt ? d.nhatKy?.nhatKy.find((j) => j.tuan === tuanNay) : undefined;
  const taoPhieu = d.ds.length > 0 && d.mau.length > 0 && !d.laTt;
  return (
    <>
      <DauTrang
        tieuDe="Thực tập"
        moTa="Thực tập sinh viết nhật ký tuần; người hướng dẫn nhận xét. Cuối đợt, người hướng dẫn chấm phiếu đánh giá theo mẫu của trường rồi in A4 để nộp trường."
        hanhDong={
          <span style={{ display: "flex", gap: 6 }}>
            {coQuyen(nd.hoSo, "nhan_su.view") && <Link className="nut" href="/thuc-tap/mau">Mẫu phiếu đánh giá</Link>}
            {taoPhieu && (
              <FormNhanh nhanNut="Tạo phiếu đánh giá" tieuDe="Tạo phiếu đánh giá thực tập" url="/api/v1/thuc-tap/danh-gia" lopNut="nut chinh"
                truong={[
                  { ten: "nguoiId", nhan: "Thực tập sinh", kieu: "select", luaChon: d.ds.map((x) => ({ giaTri: x.id, nhan: `${x.hoTen}${x.truong ? ` — ${x.truong}` : ""}` })), caDong: true },
                  { ten: "mauId", nhan: "Mẫu phiếu", kieu: "select", luaChon: d.mau.map((m) => ({ giaTri: m.id, nhan: `${m.ten}${m.truong ? ` (${m.truong})` : ""}` })), caDong: true },
                  { ten: "tuNgay", nhan: "Từ ngày", kieu: "date", goiY: "Trống = theo hồ sơ thực tập." },
                  { ten: "denNgay", nhan: "Đến ngày", kieu: "date" },
                ]}
                giaTriDau={{ nguoiId: d.ds[0]?.id ?? "", mauId: d.mau[0]?.id ?? "" }} />
            )}
          </span>
        }
      />

      {d.laTt && (
        <section className="the">
          <div className="dau"><h2>Nhật ký tuần này ({vn(tuanNay)})</h2>{cuaTuanNay?.trangThai === "da-nop" && <span className="huy-hieu tot">Đã nộp</span>}</div>
          <FormNhatKy daLam={cuaTuanNay?.daLam ?? ""} hocDuoc={cuaTuanNay?.hocDuoc ?? ""} vuongMac={cuaTuanNay?.vuongMac ?? ""} khoa={cuaTuanNay?.trangThai === "da-nop"} />
        </section>
      )}

      {!d.laTt && d.ds.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Thực tập sinh</h2></div>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Họ tên</th><th>Trường</th><th>Người hướng dẫn</th><th>Thời gian</th><th /></tr></thead>
            <tbody>{d.ds.map((x) => (
              <tr key={x.id} className={x.id === d.nguoi ? "chon" : undefined}>
                <td>{x.hoTen}</td><td>{x.truong}</td><td>{x.nguoiHuongDan}</td><td>{vn(x.tuNgay)} – {vn(x.denNgay)}</td>
                <td><Link href={`?nguoi=${x.id}`}>Xem nhật ký</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {d.nhatKy && (
        <section className="the">
          <div className="dau"><h2>Nhật ký {d.laTt ? "của tôi" : `— ${d.ds.find((x) => x.id === d.nguoi)?.hoTen ?? ""}`}</h2></div>
          {d.nhatKy.nhatKy.length === 0 ? <TrongRong tieuDe="Chưa có nhật ký" /> : d.nhatKy.nhatKy.map((j) => (
            <article key={j.id} style={{ borderTop: "1px solid var(--vien-nhat)", padding: "8px 0" }}>
              <strong>Tuần {vn(j.tuan)}</strong> {j.trangThai === "da-nop" ? <span className="huy-hieu tot">Đã nộp {j.nopLuc ? dinhDangNgayGio(j.nopLuc) : ""}</span> : <span className="huy-hieu">Nháp</span>}
              <div style={{ whiteSpace: "pre-wrap" }}><em>Đã làm:</em> {j.daLam || "—"}</div>
              <div style={{ whiteSpace: "pre-wrap" }}><em>Học được:</em> {j.hocDuoc || "—"}</div>
              <div style={{ whiteSpace: "pre-wrap" }}><em>Vướng mắc:</em> {j.vuongMac || "—"}</div>
              {j.nhanXet.map((n) => <div key={n.id} className="dong-phu">Nhận xét của {n.nguoi} ({dinhDangNgayGio(n.luc)}): {n.noiDung}</div>)}
              {d.nhatKy!.duocNhanXet && j.trangThai === "da-nop" && (
                <FormNhanh nhanNut="Nhận xét" tieuDe={`Nhận xét nhật ký tuần ${vn(j.tuan)}`} url={`/api/v1/thuc-tap/nhat-ky/${j.id}/nhan-xet`} lopNut="nut nho"
                  truong={[{ ten: "noiDung", nhan: "Nhận xét", kieu: "textarea", batBuoc: true, caDong: true }]} />
              )}
            </article>
          ))}
        </section>
      )}

      <section className="the">
        <div className="dau"><h2>Phiếu đánh giá thực tập</h2></div>
        {d.phieu.length === 0 ? <TrongRong tieuDe="Chưa có phiếu đánh giá" /> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Thực tập sinh</th><th>Mẫu</th><th>Thời gian</th><th>Người hướng dẫn</th><th>Trạng thái</th><th className="so">Điểm</th><th /></tr></thead>
            <tbody>{d.phieu.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/thuc-tap/danh-gia/${p.id}`}>{p.hoTen}</Link></td><td>{p.tenMau}</td><td>{vn(p.tuNgay)} – {vn(p.denNgay)}</td><td>{p.nguoiHuongDan ?? "—"}</td>
                <td><span className={`huy-hieu ${p.trangThai === "da-chot" ? "tot" : ""}`}>{p.trangThai === "da-chot" ? "Đã chốt" : "Đang chấm"}</span></td>
                <td className="so">{p.tongDiem ?? "—"}{p.tongChu ? ` (${p.tongChu})` : ""}</td>
                <td><Link href={`/thuc-tap/danh-gia/${p.id}/in`}>In</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
