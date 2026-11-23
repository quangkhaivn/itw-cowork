import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import FormChienDich from "@/components/mang-xa-hoi/FormChienDich";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { chienDichMarketingDeChon, danhSachChienDich } from "@/modules/mang-xa-hoi/chien-dich";

export const dynamic = "force-dynamic";

/** Chiến dịch nội dung (0.25.0, QĐ-232): nhóm bài, thời gian, mục tiêu, liên kết chiến dịch Marketing (tùy chọn). */
export default async function TrangChienDich({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("mxh.view");
  const sp = await searchParams;
  const luuTru = layMot(sp.luuTru) === "1";
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { ds: await danhSachChienDich(nc, luuTru), mk: await chienDichMarketingDeChon(nc) };
  });
  const sua = coQuyen(nd.hoSo, "mxh.update");
  return (
    <>
      <DauTrang tieuDe="Chiến dịch nội dung" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa="Nhóm bài theo chiến dịch (tên, thời gian, mục tiêu). Gán chiến dịch khi soạn bài hoặc khi AI viết bài; lọc lịch nội dung theo chiến dịch."
        hanhDong={<Link className="nut" href={luuTru ? "/mang-xa-hoi/chien-dich" : "/mang-xa-hoi/chien-dich?luuTru=1"}>{luuTru ? "Ẩn chiến dịch lưu trữ" : "Hiện cả chiến dịch lưu trữ"}</Link>} />
      {sua && (
        <section className="the">
          <div className="dau"><h2>Tạo chiến dịch</h2></div>
          <div className="than" style={{ padding: 16 }}><FormChienDich marketing={d.mk} /></div>
        </section>
      )}
      <section className="the">
        <div className="dau"><h2>Chiến dịch ({d.ds.length})</h2></div>
        {d.ds.length === 0 ? <TrongRong tieuDe="Chưa có chiến dịch">Tạo chiến dịch để nhóm các bài cùng mục tiêu.</TrongRong> : (
          <div className="than" style={{ padding: 16, display: "grid", gap: 16 }}>
            {d.ds.map((c) => (
              <details key={c.id} className="the" style={{ padding: 12 }}>
                <summary style={{ cursor: "pointer" }}>
                  <strong>{c.ten}</strong> {c.trangThai === "luu-tru" && <span className="huy-hieu">Lưu trữ</span>}
                  <span className="phu nho"> · {c.tuNgay ? dinhDangNgay(c.tuNgay) : "—"} → {c.denNgay ? dinhDangNgay(c.denNgay) : "—"} · {c.soBai} bài ({c.soDaDang} đã đăng)
                    {c.chienDichMarketing && <> · Marketing: {c.chienDichMarketing.ma ? `${c.chienDichMarketing.ma} — ` : ""}{c.chienDichMarketing.ten}</>}</span>
                  {" "}<Link className="nho" href={`/mang-xa-hoi/lich?chienDichId=${c.id}${c.tuNgay ? `&thang=${c.tuNgay.slice(0, 7)}` : ""}`}>Xem trên lịch</Link>
                </summary>
                {c.mucTieu && <p className="phu" style={{ whiteSpace: "pre-wrap" }}>Mục tiêu: {c.mucTieu}</p>}
                {sua && <FormChienDich cd={c} marketing={d.mk} />}
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
