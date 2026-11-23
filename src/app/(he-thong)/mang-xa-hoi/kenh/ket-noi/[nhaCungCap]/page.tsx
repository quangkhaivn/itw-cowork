import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import NutBatDauOAuth from "@/components/mang-xa-hoi/NutBatDauOAuth";
import { taoNguCanh } from "@/lib/api";
import { LoiNghiepVu } from "@/lib/loi";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { manHinhDongY } from "@/modules/mang-xa-hoi/oauth";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Màn hình ĐỒNG Ý của Cowork (0.24.0, QĐ-210 — SEC-03): trước khi chuyển sang Facebook / Google, hiện rõ nền tảng, từng quyền
 * xin + vì sao, kênh sẽ kết nối lại (nếu có). Bấm "Tiếp tục" mới sinh state (dùng một lần, 10 phút) và chuyển đi.
 */
export default async function TrangDongY({ params, searchParams }: { params: Promise<{ nhaCungCap: string }>; searchParams: Promise<{ kenh?: string }> }) {
  const nd = await yeuCauQuyen("mxh.update");
  const { nhaCungCap } = await params;
  const kenhId = (await searchParams).kenh;
  if (!["meta", "google"].includes(nhaCungCap)) notFound();
  const d = await docDuLieu(nd, async (tx) => {
    try {
      return await manHinhDongY(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), nhaCungCap, kenhId && LA_UUID.test(kenhId) ? kenhId : null);
    } catch (e) {
      if (e instanceof LoiNghiepVu) return null;
      throw e;
    }
  });
  if (!d) notFound();
  return (
    <>
      <DauTrang tieuDe={`Kết nối ${d.ten}`} duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }, { nhan: "Kênh", href: "/mang-xa-hoi/kenh" }]}
        moTa="Đọc kỹ các quyền dưới đây. Bấm Tiếp tục: trình duyệt chuyển sang trang đăng nhập của nền tảng để bạn cấp quyền, rồi quay về Cowork cho bạn chọn kênh." />
      {d.loi && <div className="hop-thong-bao loi" role="alert"><strong>Chưa kết nối được:</strong> {d.loi}</div>}
      <section className="the">
        <div className="dau"><h2>{d.kenhKetNoiLai ? `Kết nối lại: ${d.kenhKetNoiLai.ten} (${d.kenhKetNoiLai.nenTang})` : `Nền tảng: ${d.nenTang.join(", ") || d.ten}`}</h2></div>
        <div className="than" style={{ padding: 16, display: "grid", gap: 12 }}>
          <p>Cowork (ứng dụng của công ty) sẽ xin các quyền sau trên tài khoản <strong>{d.ten}</strong> của bạn:</p>
          <table className="bang"><thead><tr><th>Quyền</th><th>Dùng để</th></tr></thead>
            <tbody>{d.quyen.map((q) => <tr key={q.ma}><td><code>{q.ma.replace("https://www.googleapis.com/auth/", "")}</code>{!q.batBuoc && <div className="phu nho">không bắt buộc</div>}</td><td>{q.giaiThich}</td></tr>)}</tbody>
          </table>
          <ul className="nho">
            <li>Sau khi cấp quyền, bạn <strong>chọn</strong> Page / tài khoản Instagram / kênh YouTube muốn nối; kênh không chọn thì Cowork không giữ quyền.</li>
            <li>Mã truy cập được mã hóa trên máy chủ, không bao giờ hiện lại. Gỡ quyền bất cứ lúc nào bằng “Ngắt kết nối” hoặc trên trang cài đặt của nền tảng.</li>
            <li>Liên kết đăng nhập chỉ dùng được <strong>một lần</strong> trong <strong>10 phút</strong>, trên chính trình duyệt này.</li>
          </ul>
          {!d.loi && <div><NutBatDauOAuth nhaCungCap={nhaCungCap} kenhId={d.kenhKetNoiLai?.id ?? null} /></div>}
        </div>
      </section>
    </>
  );
}
