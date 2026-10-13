import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachForm } from "@/modules/marketing/service";
import { gocCongKhai } from "../goc-cong-khai";

export const dynamic = "force-dynamic";

export default async function TrangForm() {
  const nd = await yeuCauQuyen("marketing.view");
  const ds = await docDuLieu(nd, (tx) => danhSachForm(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const goc = await gocCongKhai();
  return (
    <>
      <DauTrang
        tieuDe="Form đăng ký"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Form công khai để khách tự để lại thông tin: dùng đường dẫn trực tiếp trên quảng cáo, hoặc nhúng iframe vào website. Mọi lần gửi đi qua một cửa nhận lead."
        hanhDong={
          coQuyen(nd.hoSo, "marketing.create") && (
            <Link className="nut chinh" href="/marketing/form/moi">
              <BieuTuong ten="them" co={16} /> Tạo form
            </Link>
          )
        }
      />
      <section className="the">
        {ds.length === 0 ? (
          <TrongRong tieuDe="Chưa có form nào">Tạo form, rồi đặt đường dẫn lên quảng cáo hoặc nhúng vào website.</TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Form</th>
                  <th>Đường dẫn công khai</th>
                  <th className="so">Lượt xem</th>
                  <th className="so">Lượt gửi</th>
                  <th className="so an-tren-dt">Lead mới</th>
                  <th className="so an-tren-dt">Bị chặn</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((f) => (
                  <tr key={f.id} className={f.trangThai === "tat" ? "mo" : undefined}>
                    <td>
                      <Link href={`/marketing/form/${f.id}`}>{f.ten}</Link>
                      <div className="dong-phu">
                        {f.trangThai === "tat" ? "Đã tắt" : "Đang nhận"}
                        {f.chienDich ? ` · ${f.chienDich.ma}` : ""}
                      </div>
                    </td>
                    <td className="nho" style={{ wordBreak: "break-all" }}>
                      {goc}/f/{nd.tenant.code}/{f.slug}
                    </td>
                    <td className="so">{dinhDangSo(f.luotXem)}</td>
                    <td className="so">{dinhDangSo(f.soLanGui)}</td>
                    <td className="so an-tren-dt">{dinhDangSo(f.soLeadMoi)}</td>
                    <td className="so an-tren-dt">
                      {f.soBiChan > 0 ? <Link href={`/marketing/nhan-lead?formId=${f.id}&ketQua=tu-choi`}>{dinhDangSo(f.soBiChan)}</Link> : "0"}
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
