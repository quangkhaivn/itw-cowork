import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import KenhCuaBai from "@/components/mang-xa-hoi/KenhCuaBai";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachChoDuyet } from "@/modules/mang-xa-hoi/bai";

export const dynamic = "force-dynamic";

/** Bài chờ TÔI duyệt — chỉ bài tôi là người duyệt hợp lệ (không tự duyệt; cấp trên / Giám đốc / Quản trị / trong phạm vi). */
export default async function TrangChoDuyet() {
  const nd = await yeuCauQuyen("mxh.approve");
  const ds = await docDuLieu(nd, (tx) => danhSachChoDuyet(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang tieuDe="Chờ duyệt" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa="Bài mạng xã hội đang chờ bạn duyệt. Bài bạn tự soạn / tự gửi duyệt không hiện ở đây — cần người khác duyệt." />
      <section className="the">
        {ds.length === 0 ? <TrongRong tieuDe="Không có bài chờ duyệt">Khi có bài gửi duyệt, chuông thông báo sẽ báo bạn.</TrongRong> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Bài</th><th>Người soạn</th><th>Gửi lúc</th><th>Duyệt xong thì</th><th>Kênh</th></tr></thead>
            <tbody>{ds.map((b) => (
              <tr key={b.id}>
                <td><Link href={`/mang-xa-hoi/bai/${b.id}`}>{b.tieuDe ?? b.noiDung.slice(0, 80)}</Link>{b.doAiTao && <span className="huy-hieu thong-tin"> AI soạn</span>}</td>
                <td>{b.nguoiSoan}{b.nguoiGuiDuyet && b.nguoiGuiDuyet !== b.nguoiSoan && <span className="phu nho"> (gửi: {b.nguoiGuiDuyet})</span>}</td>
                <td>{dinhDangNgayGio(b.guiDuyetLuc)}</td>
                <td>{b.cheDoDang === "ngay" ? "Đăng ngay" : b.cheDoDang === "hen-gio" && b.henLuc ? `Đăng lúc ${dinhDangNgayGio(b.henLuc)}` : "Chờ chọn giờ"}</td>
                <td><KenhCuaBai kenh={b.kenh} gon /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
