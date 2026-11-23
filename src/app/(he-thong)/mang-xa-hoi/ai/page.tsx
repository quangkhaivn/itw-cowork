import DauTrang from "@/components/ui/DauTrang";
import VietBaiAi from "@/components/mang-xa-hoi/VietBaiAi";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { trangThaiAiVietBai } from "@/modules/mang-xa-hoi/ai/service";
import { danhSachChienDich } from "@/modules/mang-xa-hoi/chien-dich";
import { danhSachKenh } from "@/modules/mang-xa-hoi/kenh";

export const dynamic = "force-dynamic";

/** AI viết bài từ sản phẩm (0.25.0, QĐ-237 → QĐ-239) + ngân sách AI tháng này (QĐ-236). */
export default async function TrangAiVietBai() {
  const nd = await yeuCauQuyen("mxh.create");
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { tt: await trangThaiAiVietBai(nc), kenh: await danhSachKenh(nc), cd: await danhSachChienDich(nc) };
  });
  const ns = d.tt.nganSach;
  return (
    <>
      <DauTrang tieuDe="AI viết bài" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa={<>Chọn sản phẩm và kênh — AI viết nội dung chung + biến thể theo từng nền tảng, theo hồ sơ thương hiệu, dùng <strong>giá bán thật</strong> và <strong>tình trạng tồn hiện tại</strong>. {d.tt.aiPhaiDuyet ? "Bài do AI tạo phải được duyệt trước khi đăng." : "Cấu hình đang cho phép đăng bài AI không cần duyệt — không khuyến nghị."}</>} />
      <section className="the">
        <div className="dau"><h2>Ngân sách AI tháng {ns.thang.slice(5)}/{ns.thang.slice(0, 4)}</h2></div>
        <div className="than" style={{ padding: 16, display: "grid", gap: 6 }}>
          <div>Đã dùng <strong>{dinhDangSo(ns.daDungToken)}</strong>{ns.hanToken !== null ? <> / {dinhDangSo(ns.hanToken)}</> : null} token · khoảng <strong>{dinhDangTien(ns.daDungVnd)}</strong>{ns.hanVnd !== null ? <> / {dinhDangTien(ns.hanVnd)}</> : null} · {ns.soLuot} lượt</div>
          {ns.phanTram !== null && <progress max={100} value={ns.phanTram} aria-label="Phần trăm ngân sách AI đã dùng" style={{ width: "100%" }} />}
          {!ns.conDung && <div className="hop-thong-bao canh-bao">Ngân sách AI tháng này đã hết (hoặc đang đặt bằng 0). {d.tt.nangNganSach ? "Nâng ở Quản trị → Cấu hình hệ thống → Mạng xã hội." : "Nhờ Giám đốc / Quản trị nâng ở Cấu hình hệ thống."}</div>}
          <span className="phu nho">Chi phí VND là ước tính (token × đơn giá trong Cấu hình). Mỗi lượt giữ chỗ phần tối đa trước khi gọi; lượt sẽ vượt ngân sách bị chặn.</span>
        </div>
      </section>
      {!d.tt.duocDung ? <div className="hop-thong-bao canh-bao">{d.tt.lyDoKhongDung}</div> : (
        <VietBaiAi daCauHinh={d.tt.daCauHinh} lyDo={d.tt.lyDoChuaCauHinh} nganSachHet={!ns.conDung}
          kenh={d.kenh.filter((k) => k.trangThai === "ACTIVE").map((k) => ({ id: k.id, ten: k.ten, tenNenTang: k.tenNenTang, trangThai: k.trangThai }))}
          chienDich={d.cd.map((c) => ({ id: c.id, ten: c.ten }))} />
      )}
    </>
  );
}
