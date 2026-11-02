import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauMotTrongCacQuyen } from "@/lib/trang";
import { danhSachMauPhieu } from "@/modules/thuc-tap/service";
import { MAU_PHIEU_MAC_DINH, NHAN_NGUON_TU_DONG } from "@/modules/danh-gia/tinh-toan";
import SuaMauPhieu from "./SuaMauPhieu";

export const dynamic = "force-dynamic";

/** Mẫu phiếu đánh giá thực tập (DG-72): mỗi trường một mẫu, Nhân sự cấu hình — không cần sửa mã. */
export default async function TrangMauPhieu() {
  const nd = await yeuCauMotTrongCacQuyen(["nhan_su.view", "danh_gia.view"]);
  const ds = await docDuLieu(nd, (tx) => danhSachMauPhieu(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const sua = coQuyen(nd.hoSo, "nhan_su.update");
  return (
    <>
      <DauTrang
        tieuDe="Mẫu phiếu đánh giá thực tập"
        duongDan={[{ nhan: "Thực tập", href: "/thuc-tap" }]}
        moTa="Dựng theo mẫu giấy của từng trường: ô thông tin, phần + tiêu chí (trọng số, thang 10 hoặc thang chữ, nguồn tự động), ô nhận xét, ô ký, ghi chú. Phiếu đã tạo giữ bản chụp mẫu lúc tạo."
        hanhDong={sua && <SuaMauPhieu mauGoc={MAU_PHIEU_MAC_DINH} nhanNut="Thêm mẫu (từ mẫu chung)" />}
      />
      {ds.map((m) => (
        <section className="the" key={m.id}>
          <div className="dau">
            <h2>{m.ten} <span className="phu nho">({m.ma} · phiên bản {m.phienBan}{m.truong ? ` · ${m.truong}` : ""}{m.trangThai !== "hoat-dong" ? " · ngừng" : ""})</span></h2>
            {sua && <SuaMauPhieu mau={m} mauGoc={MAU_PHIEU_MAC_DINH} nhanNut="Sửa" lopNut="nut nho" />}
          </div>
          <p style={{ margin: "0 0 6px" }}><strong>{m.boCuc.tieuDe}</strong>{m.boCuc.tieuDePhu ? ` — ${m.boCuc.tieuDePhu}` : ""}</p>
          <ul>
            {m.boCuc.phan.map((p) => (
              <li key={p.ten}>{p.ten}: {p.tieuChi.map((t) => `${t.ten} (${t.trongSo}${t.thang === "chu" ? ", thang chữ" : ""}${t.nguon ? `, tự động: ${NHAN_NGUON_TU_DONG[t.nguon]}` : ""})`).join("; ")}</li>
            ))}
          </ul>
          <p className="phu nho" style={{ margin: 0 }}>Ô nhận xét: {m.boCuc.oNhanXet.map((o) => o.nhan).join(", ") || "—"} · Ô ký: {m.boCuc.oKy.map((o) => o.nhan).join(", ") || "—"} · Thang chữ: {m.boCuc.thangChu.map((c) => c.chu).join(" ")}</p>
        </section>
      ))}
    </>
  );
}
