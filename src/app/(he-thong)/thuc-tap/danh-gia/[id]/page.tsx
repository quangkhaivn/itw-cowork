import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import NutHanhDong from "@/components/danh-gia/NutHanhDong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietPhieuThucTap } from "@/modules/thuc-tap/service";
import { NHAN_NGUON_TU_DONG, type NguonTuDong } from "@/modules/danh-gia/tinh-toan";
import ChamThucTap from "./ChamThucTap";

export const dynamic = "force-dynamic";

const vn = (s: string) => (s ? s.split("-").reverse().join("/") : "");

/** Phiếu đánh giá thực tập (DG-73 → DG-76): chấm theo mẫu đã chụp, điểm tổng máy tính, chốt, in A4. */
export default async function TrangPhieuThucTap({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("danh_gia.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietPhieuThucTap(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (e) {
      if (e instanceof LoiKhongTimThay) return null;
      throw e;
    }
  });
  if (!d) notFound();
  const p = d.phieu;
  return (
    <>
      <DauTrang
        tieuDe={`Phiếu đánh giá thực tập — ${p.hoTen}`}
        duongDan={[{ nhan: "Thực tập", href: "/thuc-tap" }]}
        moTa={<>Mẫu “{p.tenMau}” (phiên bản {p.phienBanMau}) · {vn(p.tuNgay)} – {vn(p.denNgay)} · người hướng dẫn {p.nguoiHuongDan ?? "—"} · {p.trangThai === "da-chot" ? `đã chốt bởi ${p.nguoiChot} lúc ${p.chotLuc ? dinhDangNgayGio(p.chotLuc) : ""}` : "đang chấm"}</>}
        hanhDong={
          <span style={{ display: "flex", gap: 6 }}>
            {d.quyen.lamMoi && <NutHanhDong url={`/api/v1/thuc-tap/danh-gia/${id}/lam-moi`} nhan="Làm mới số liệu tự động" />}
            {d.quyen.chot && <NutHanhDong url={`/api/v1/thuc-tap/danh-gia/${id}/chot`} nhan="Chốt phiếu" lopNut="nut chinh" xacNhan="Chốt phiếu? Chốt rồi không sửa được." />}
            <Link className="nut" href={`/thuc-tap/danh-gia/${id}/in`}>In / Lưu PDF</Link>
          </span>
        }
      />
      <div className="luoi-chi-so">
        <div className={`the chi-so ${d.ketQua?.tong !== null && d.ketQua?.tong !== undefined ? "tot" : ""}`}>
          <div className="nhan">Điểm tổng (thang 10)</div>
          <div className="gia-tri">{d.ketQua?.tong ?? "—"}{d.ketQua?.chu ? ` (${d.ketQua.chu})` : ""}</div>
          <div className="ghi-chu">{d.ketQua && d.ketQua.thieu.length ? `Còn thiếu: ${d.ketQua.thieu.join(", ")}` : "Đủ điểm mọi tiêu chí"}</div>
        </div>
        {(Object.keys(NHAN_NGUON_TU_DONG) as NguonTuDong[]).map((k) => (
          <div className="the chi-so" key={k}>
            <div className="nhan">{NHAN_NGUON_TU_DONG[k]}</div>
            <div className="gia-tri" style={{ fontSize: 16 }}>{d.tuDong[k] ?? "—"}{d.tuDong[k] !== null && d.tuDong[k] !== undefined ? (k === "chat-luong-viec" ? "/5" : "%") : ""}</div>
          </div>
        ))}
      </div>
      {d.quyen.cham ? (
        <section className="the"><div className="dau"><h2>Chấm điểm</h2></div><ChamThucTap id={id} mau={d.mau} thongTin={d.thongTin} diem={d.diem} nhanXet={d.nhanXet} tuDong={d.tuDong} /></section>
      ) : (
        <section className="the">
          <div className="dau"><h2>Điểm từng tiêu chí</h2></div>
          <ul>{(d.ketQua?.chiTiet ?? []).map((c) => <li key={c.ma}>{c.ten}: <strong>{c.nhap ?? c.diem10 ?? "—"}</strong>{c.tuDong ? " (tự động)" : ""}</li>)}</ul>
          {d.mau.oNhanXet.map((o) => <p key={o.ma}><strong>{o.nhan}:</strong> {d.nhanXet[o.ma] || "—"}</p>)}
        </section>
      )}
    </>
  );
}
