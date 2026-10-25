import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocSoDongY, xemSoDongY } from "@/modules/email/so-dong-y";
import GhiSoDongY from "./GhiSoDongY";

export const dynamic = "force-dynamic";

const LOP: Record<string, string> = { "dong-y": "tot", rut: "canh-bao", "phan-doi": "loi" };

/** Sổ đồng ý nhận thư quảng cáo (EG-08): chỉ ghi thêm — mỗi lần đồng ý / rút / phản đối một dòng có căn cứ. */
export default async function TrangSoDongY({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("marketing.view");
  const sp = await searchParams;
  const loc = LuocDoLocSoDongY.parse({ q: layMot(sp.q), trang: layMot(sp.trang) || 1 });
  const kq = await docDuLieu(nd, (tx) => xemSoDongY(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), loc));
  const tt = kq.theoTrangThai;
  return (
    <>
      <DauTrang
        tieuDe="Sổ đồng ý email"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Ai đã đồng ý nhận thư quảng cáo, khi nào, căn cứ gì (NĐ 91/2020). Sổ chỉ ghi thêm: rút đồng ý, huỷ nhận tin, báo thư rác đều là một dòng mới; dòng mới nhất của mỗi email là trạng thái hiện hành."
      />
      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Đang đồng ý</div>
          <div className="gia-tri">{dinhDangSo(tt["dong-y"] ?? 0)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Đã rút</div>
          <div className="gia-tri">{dinhDangSo(tt.rut ?? 0)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Phản đối (báo rác)</div>
          <div className="gia-tri">{dinhDangSo(tt["phan-doi"] ?? 0)}</div>
        </div>
        <div className={`the chi-so ${kq.batBuoc ? "" : "canh-bao"}`}>
          <div className="nhan">Bắt buộc khi duyệt chiến dịch</div>
          <div className="gia-tri">{kq.batBuoc ? "Bật" : "Tắt"}</div>
          <div className="ghi-chu">{kq.batBuoc ? `Người chưa có đồng ý bị loại: “${kq.lyDoChua}”` : "Cấu hình email.bat_buoc_dong_y = 0"}</div>
        </div>
      </div>
      <div className="luoi-ben-phai">
        <section className="the">
          <form className="bo-loc" method="get">
            <div className="truong rong">
              <label htmlFor="q">Tra email</label>
              <input id="q" name="q" type="search" defaultValue={loc.q} placeholder="Email đầy đủ (xem lịch sử) hoặc một phần" />
            </div>
            <button className="nut" type="submit">
              Tra
            </button>
          </form>
          {kq.hienTai && (
            <p className="nho" style={{ padding: "0 16px" }}>
              Trạng thái hiện hành của <strong>{loc.q}</strong>: <span className={`huy-hieu ${LOP[kq.hienTai.hanhDong] ?? ""}`}>{kq.hienTai.nhan}</span> từ {dinhDangNgayGio(kq.hienTai.luc)}
            </p>
          )}
          {kq.dong.length === 0 ? (
            <TrongRong tieuDe="Chưa có dòng nào">Đồng ý được ghi tự động khi khách tự tích ô đồng ý trên form đăng ký; hoặc ghi tay / nhập CSV kèm căn cứ.</TrongRong>
          ) : (
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Hành động</th>
                    <th>Căn cứ</th>
                    <th className="an-tren-dt">Thời điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {kq.dong.map((d) => (
                    <tr key={d.id}>
                      <td>{d.email}</td>
                      <td>
                        <span className={`huy-hieu ${LOP[d.hanhDong] ?? ""}`}>{d.nhanHanhDong}</span>
                        <div className="dong-phu">{d.nhanNguon}</div>
                      </td>
                      <td className="nho">
                        {d.canCu}
                        {d.nguoiGhi && <div className="dong-phu">Người ghi: {d.nguoiGhi}</div>}
                      </td>
                      <td className="an-tren-dt nho">
                        {dinhDangNgayGio(d.luc)}
                        <div className="dong-phu">ghi sổ {dinhDangNgayGio(d.ghiLuc)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/marketing/email/dong-y" thamSo={{ q: loc.q }} />
        </section>
        {coQuyen(nd.hoSo, "marketing.update") ? (
          <GhiSoDongY />
        ) : (
          <section className="the">
            <div className="than">
              <p className="phu">Ghi tay và nhập CSV cần quyền marketing.update.</p>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
