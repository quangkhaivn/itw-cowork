import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import LichNoiDung from "@/components/mang-xa-hoi/LichNoiDung";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { boLocLich, lichNoiDung } from "@/modules/mang-xa-hoi/lich";
import { NHAN_TRANG_THAI_LICH, ngayVN, type TrangThaiLich } from "@/modules/mang-xa-hoi/lich-thuan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lịch nội dung tháng / tuần (0.25.0, QĐ-230): mọi bài có giờ hẹn hoặc ngày dự kiến, lọc theo kênh / chiến dịch / người soạn. */
export default async function TrangLichNoiDung({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("mxh.view");
  const sp = await searchParams;
  const kieu = layMot(sp.kieu) === "tuan" ? "tuan" : "thang";
  const thang = /^\d{4}-\d{2}$/.test(layMot(sp.thang)) ? layMot(sp.thang) : undefined;
  const ngay = /^\d{4}-\d{2}-\d{2}$/.test(layMot(sp.ngay)) ? layMot(sp.ngay) : undefined;
  const uuid = (k: string) => (LA_UUID.test(layMot(sp[k])) ? layMot(sp[k]) : undefined);
  const loc = { kenhId: uuid("kenhId"), chienDichId: uuid("chienDichId"), nguoiSoanId: uuid("nguoiSoanId") };
  const bayGio = new Date();
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { lich: await lichNoiDung(nc, { kieu, thang, ngay, ...loc }, bayGio), boLoc: await boLocLich(nc) };
  });
  const k = d.lich.khung;
  const thamSo = (them: Record<string, string>) => {
    const q = new URLSearchParams({ kieu, ...Object.fromEntries(Object.entries(loc).filter(([, v]) => v)) as Record<string, string>, ...them });
    return `/mang-xa-hoi/lich?${q}`;
  };
  const truoc = kieu === "tuan" ? thamSo({ ngay: k.truoc }) : thamSo({ thang: k.truoc });
  const sau = kieu === "tuan" ? thamSo({ ngay: k.sau }) : thamSo({ thang: k.sau });
  const dem = new Map<TrangThaiLich, number>();
  for (const m of d.lich.muc) dem.set(m.trangThai, (dem.get(m.trangThai) ?? 0) + 1);

  return (
    <>
      <DauTrang tieuDe="Lịch nội dung" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa="Mọi bài có giờ hẹn (nét liền) hoặc ngày dự kiến (nét đứt), theo giờ Việt Nam. Kéo bài sang ngày khác hoặc bấm vào bài để đổi giờ — bài đã đăng / đang đăng / lỗi không đổi được; YouTube tối đa theo hạn mức mỗi ngày."
        hanhDong={<div style={{ display: "flex", gap: 8 }}>
          {coQuyen(nd.hoSo, "mxh.create") && <Link className="nut chinh" href="/mang-xa-hoi/soan">Soạn bài</Link>}
          {coQuyen(nd.hoSo, "mxh.create") && <Link className="nut" href="/mang-xa-hoi/ai">AI viết bài</Link>}
        </div>} />

      <section className="the">
        <div className="than" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <Link className="nut nho" href={truoc}>← {kieu === "tuan" ? "Tuần trước" : "Tháng trước"}</Link>
          <strong style={{ alignSelf: "center" }}>{k.nhan}</strong>
          <Link className="nut nho" href={sau}>{kieu === "tuan" ? "Tuần sau" : "Tháng sau"} →</Link>
          <Link className={`nut nho${kieu === "thang" ? " chinh" : ""}`} href={thamSo({ kieu: "thang", thang: k.thang })}>Tháng</Link>
          <Link className={`nut nho${kieu === "tuan" ? " chinh" : ""}`} href={thamSo({ kieu: "tuan", ngay: kieu === "tuan" ? k.ngay[0] : (k.thang === ngayVN(bayGio).slice(0, 7) ? ngayVN(bayGio) : `${k.thang}-01`) })}>Tuần</Link>
          <Link className="nut nho" href={thamSo(kieu === "tuan" ? { ngay: ngayVN(bayGio) } : { thang: ngayVN(bayGio).slice(0, 7) })}>Hôm nay</Link>
          <form method="get" action="/mang-xa-hoi/lich" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginLeft: "auto" }}>
            <input type="hidden" name="kieu" value={kieu} />
            {kieu === "tuan" ? <input type="hidden" name="ngay" value={k.ngay[0]} /> : <input type="hidden" name="thang" value={k.thang} />}
            <label className="nho" style={{ display: "flex", flexDirection: "column" }}>Kênh
              <select name="kenhId" defaultValue={loc.kenhId ?? ""}><option value="">Mọi kênh</option>{d.boLoc.kenh.map((x) => <option key={x.id} value={x.id}>{x.ten} ({x.tenNenTang})</option>)}</select>
            </label>
            <label className="nho" style={{ display: "flex", flexDirection: "column" }}>Chiến dịch
              <select name="chienDichId" defaultValue={loc.chienDichId ?? ""}><option value="">Mọi chiến dịch</option>{d.boLoc.chienDich.map((x) => <option key={x.id} value={x.id}>{x.ten}</option>)}</select>
            </label>
            <label className="nho" style={{ display: "flex", flexDirection: "column" }}>Người soạn
              <select name="nguoiSoanId" defaultValue={loc.nguoiSoanId ?? ""}><option value="">Mọi người</option>{d.boLoc.nguoiSoan.map((x) => <option key={x.id} value={x.id}>{x.ten}</option>)}</select>
            </label>
            <button type="submit" className="nut nho">Lọc</button>
          </form>
        </div>
        <div className="than phu nho" style={{ padding: "0 12px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[...dem.entries()].map(([t, n]) => <span key={t} className={`huy-hieu ${NHAN_TRANG_THAI_LICH[t].lop}`}>{NHAN_TRANG_THAI_LICH[t].nhan}: {n}</span>)}
          {d.lich.muc.length === 0 && <span>Không có bài trong khoảng này.</span>}
          {d.lich.gioiHan && <span className="huy-hieu canh-bao">Chỉ hiện 1.000 bài đầu — lọc hẹp hơn.</span>}
        </div>
      </section>

      <LichNoiDung kieu={kieu} ngay={k.ngay} thang={k.thang} homNay={ngayVN(bayGio)}
        muc={d.lich.muc.map((m) => ({ ...m, luc: m.luc.toISOString() }))} />
    </>
  );
}
