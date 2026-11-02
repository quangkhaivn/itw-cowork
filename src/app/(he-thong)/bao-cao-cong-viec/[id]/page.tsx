import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietBaoCao } from "@/modules/bao-cao-cong-viec/service";
import { NHAN_LOAI_BAO_CAO } from "@/modules/danh-gia/tinh-toan";

export const dynamic = "force-dynamic";

const vn = (s: string) => s.split("-").reverse().join("/");

/** Một báo cáo: ba phần, nhận xét của quản lý, chuyển vướng mắc thành việc (DG-44). */
export default async function TrangMotBaoCao({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("danh_gia.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietBaoCao(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (e) {
      if (e instanceof LoiKhongTimThay) return null;
      throw e;
    }
  });
  if (!d) notFound();
  const b = d.baoCao;
  return (
    <>
      <DauTrang
        tieuDe={`${NHAN_LOAI_BAO_CAO[b.loai]} — ${b.nguoi}`}
        duongDan={[{ nhan: "Báo cáo công việc", href: "/bao-cao-cong-viec" }]}
        moTa={<>{b.tu === b.den ? vn(b.tu) : `${vn(b.tu)} – ${vn(b.den)}`} · hạn {dinhDangNgayGio(b.han)} · {b.trangThai === "da-nop" ? `nộp ${b.nopLuc ? dinhDangNgayGio(b.nopLuc) : ""}${b.tre ? " (trễ hạn)" : ""}` : "chưa nộp"}</>}
        hanhDong={
          <span style={{ display: "flex", gap: 6 }}>
            {d.quyen.nhanXet && <FormNhanh nhanNut="Nhận xét" tieuDe="Nhận xét báo cáo" url={`/api/v1/bao-cao-cong-viec/${id}/nhan-xet`} lopNut="nut" truong={[{ ten: "noiDung", nhan: "Nhận xét", kieu: "textarea", batBuoc: true, caDong: true }]} />}
            {d.quyen.chuyenViec && (
              <FormNhanh nhanNut="Chuyển vướng mắc thành việc" tieuDe="Tạo việc từ vướng mắc" url={`/api/v1/bao-cao-cong-viec/${id}/chuyen-viec`} lopNut="nut chinh"
                truong={[
                  { ten: "tieuDe", nhan: "Việc cần làm", kieu: "text", batBuoc: true, caDong: true },
                  { ten: "han", nhan: "Hạn", kieu: "datetime-local" },
                  { ten: "moTa", nhan: "Ghi chú thêm", kieu: "textarea", caDong: true, goiY: "Nội dung vướng mắc được chép sẵn vào việc. Việc giao cho bạn; đổi người làm ở trang việc." },
                ]}
                giaTriDau={{ tieuDe: `Gỡ vướng mắc: ${b.vuongMac.split("\n")[0].slice(0, 80)}` }} />
            )}
          </span>
        }
      />
      <div className="luoi-the">
        <section className="the"><div className="dau"><h2>Đã làm</h2></div><p style={{ whiteSpace: "pre-wrap" }}>{b.daLam || "—"}</p></section>
        <section className="the"><div className="dau"><h2>Sẽ làm</h2></div><p style={{ whiteSpace: "pre-wrap" }}>{b.seLam || "—"}</p></section>
      </div>
      <section className="the"><div className="dau"><h2>Vướng mắc</h2></div><p style={{ whiteSpace: "pre-wrap" }}>{b.vuongMac || "Không có"}</p></section>
      <section className="the">
        <div className="dau"><h2>Nhận xét</h2></div>
        {d.nhanXet.length === 0 ? <p className="phu">Chưa có nhận xét.</p> : (
          <ul>{d.nhanXet.map((n) => (
            <li key={n.id}>{dinhDangNgayGio(n.luc)} — <strong>{n.nguoi}</strong>: {n.noiDung}{n.viecId && <> · <Link href={`/cong-viec/${n.viecId}`}>mở việc</Link></>}</li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
