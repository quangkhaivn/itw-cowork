import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangPhanTram, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { LOP_TRANG_THAI_LANDING, NHAN_TRANG_THAI_LANDING } from "@/modules/marketing/hang-so";
import { danhSachLanding } from "@/modules/marketing/service";
import { gocCongKhai } from "../goc-cong-khai";

export const dynamic = "force-dynamic";

export default async function TrangLandingPage() {
  const nd = await yeuCauQuyen("marketing.view");
  const ds = await docDuLieu(nd, (tx) => danhSachLanding(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const goc = await gocCongKhai();
  return (
    <>
      <DauTrang
        tieuDe="Landing page"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Trang đích cho quảng cáo, dựng từ các khối có sẵn (không nhận HTML tự do). Thử A/B hai biến thể; tỷ lệ đăng ký = lượt gửi form / lượt xem."
        hanhDong={
          coQuyen(nd.hoSo, "marketing.create") && (
            <Link className="nut chinh" href="/marketing/landing/moi">
              <BieuTuong ten="them" co={16} /> Tạo landing page
            </Link>
          )
        }
      />
      <section className="the">
        {ds.length === 0 ? (
          <TrongRong tieuDe="Chưa có landing page nào" />
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Trang</th>
                  <th>Trạng thái</th>
                  <th className="so">Xem A / B</th>
                  <th className="so">Đăng ký A / B</th>
                  <th className="so an-tren-dt">Tỷ lệ A / B</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/marketing/landing/${p.id}`}>{p.ten}</Link>
                      <div className="dong-phu" style={{ wordBreak: "break-all" }}>
                        {goc}/lp/{nd.tenant.code}/{p.slug}
                      </div>
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_LANDING[p.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_LANDING[p.trangThai]}</span>
                      {p.coAB && <div className="dong-phu">Đang thử A/B</div>}
                    </td>
                    <td className="so">
                      {dinhDangSo(p.thongKe.A.xem)}
                      {p.coAB && ` / ${dinhDangSo(p.thongKe.B.xem)}`}
                    </td>
                    <td className="so">
                      {dinhDangSo(p.thongKe.A.dangKy)}
                      {p.coAB && ` / ${dinhDangSo(p.thongKe.B.dangKy)}`}
                    </td>
                    <td className="so an-tren-dt">
                      {p.thongKe.A.tyLe === null ? "—" : dinhDangPhanTram(p.thongKe.A.tyLe)}
                      {p.coAB && ` / ${p.thongKe.B.tyLe === null ? "—" : dinhDangPhanTram(p.thongKe.B.tyLe)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
