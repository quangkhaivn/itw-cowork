import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { luaChonChienDich } from "@/modules/marketing/chung";
import { danhSachNguonWebhook } from "@/modules/marketing/service";
import { gocCongKhai } from "../goc-cong-khai";
import { NutTaoWebhook, TacVuWebhook } from "./QuanLyWebhook";

export const dynamic = "force-dynamic";

export default async function TrangWebhook() {
  const nd = await yeuCauQuyen("marketing.view");
  const { ds, cd, nguon } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { ds: await danhSachNguonWebhook(nc), cd: await luaChonChienDich(nc), nguon: (await luaChonDuLieuGoc(nc, ["nguon_lead"])).nguon_lead };
  });
  const duongDan = `${await gocCongKhai()}/api/cong-khai/webhook/${nd.tenant.code}`;
  const sua = coQuyen(nd.hoSo, "marketing.update");
  return (
    <>
      <DauTrang
        tieuDe="Webhook nhận lead"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Cho Facebook Lead Ads (qua Zapier / Make), Zalo, website khác đẩy lead thẳng vào hệ thống. Mỗi nguồn một khóa bí mật — hệ thống chỉ giữ bản băm, khóa hiện đúng một lần."
        hanhDong={coQuyen(nd.hoSo, "marketing.create") && <NutTaoWebhook duongDan={duongDan} chienDich={cd} nguon={nguon} />}
      />
      <section className="the">
        {ds.length === 0 ? (
          <TrongRong tieuDe="Chưa có nguồn webhook nào" />
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Nguồn</th>
                  <th>Khóa</th>
                  <th className="so">Đã nhận</th>
                  <th className="so">Từ chối</th>
                  <th className="an-tren-dt">Nhận lần cuối</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ds.map((w) => (
                  <tr key={w.id} className={w.trangThai === "thu-hoi" ? "mo" : undefined}>
                    <td>
                      {w.ten}
                      <div className="dong-phu">
                        {w.ma}
                        {w.chienDich ? ` · ${w.chienDich.ma}` : ""}
                        {w.trangThai === "thu-hoi" ? ` · đã thu hồi ${dinhDangNgayGio(w.thuHoiLuc)}` : ""}
                      </div>
                    </td>
                    <td className="nho">{w.goiYKhoa}</td>
                    <td className="so">{dinhDangSo(w.soNhan)}</td>
                    <td className="so">
                      <Link href={`/marketing/nhan-lead?webhookSourceId=${w.id}`}>{dinhDangSo(w.soTuChoi)}</Link>
                    </td>
                    <td className="an-tren-dt nho">{w.nhanCuoiLuc ? dinhDangNgayGio(w.nhanCuoiLuc) : <span className="mo">Chưa nhận</span>}</td>
                    <td>{sua && w.trangThai === "hoat-dong" && <TacVuWebhook id={w.id} ma={w.ma} duongDan={duongDan} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="the">
        <div className="dau">
          <h2>Cách gửi</h2>
        </div>
        <div className="than phu">
          <p>
            <code>POST {duongDan}/&lt;mã nguồn&gt;</code>, thân JSON, khóa trong tiêu đề <code>X-Cowork-Key</code> (hoặc <code>Authorization: Bearer …</code>) — không đặt khóa trên đường dẫn.
          </p>
          <p style={{ marginBottom: 0 }}>
            Trường nhận: <code>hoTen</code>/<code>full_name</code>, <code>dienThoai</code>/<code>phone_number</code>, <code>email</code>, <code>congTy</code>/<code>company_name</code>, <code>chucDanh</code>/<code>job_title</code>, <code>maSoThue</code>, <code>nhuCau</code>/<code>message</code>, <code>ghiChu</code>, <code>dongYNhanTin</code> (true/false — chỉ khi chính khách đã tích), <code>utm_*</code>. Trường lạ bị bỏ qua.
          </p>
        </div>
      </section>
    </>
  );
}
