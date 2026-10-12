import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, laySoTrang, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { KENH_NHAN, NHAN_KENH_NHAN, NHAN_KET_QUA_NHAN } from "@/modules/marketing/hang-so";
import { cauHinhNhanLead, nhatKyNhanLead } from "@/modules/marketing/service";
import DanhSachNhanLead from "./DanhSachNhanLead";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f-]{36}$/i;
const LOP_KET_QUA: Record<string, string> = { "tao-moi": "tot", "ghi-them": "chinh", "tu-choi": "loi", spam: "canh-bao" };

export default async function TrangNhanLead({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("marketing.view");
  const sp = await searchParams;
  const kenh = (KENH_NHAN as readonly string[]).includes(layMot(sp.kenh)) ? layMot(sp.kenh) : "";
  const ketQua = Object.keys(NHAN_KET_QUA_NHAN).includes(layMot(sp.ketQua)) ? layMot(sp.ketQua) : "";
  const chienDichId = LA_UUID.test(layMot(sp.chienDichId)) ? layMot(sp.chienDichId) : "";
  const webhookSourceId = LA_UUID.test(layMot(sp.webhookSourceId)) ? layMot(sp.webhookSourceId) : "";
  const formId = LA_UUID.test(layMot(sp.formId)) ? layMot(sp.formId) : "";
  const trang = laySoTrang(sp.trang);
  const { ch, nk } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { ch: await cauHinhNhanLead(nc), nk: await nhatKyNhanLead(nc, { kenh, ketQua, chienDichId, webhookSourceId, formId, trang }) };
  });
  const coLoc = Boolean(kenh || ketQua || chienDichId || webhookSourceId || formId);

  return (
    <>
      <DauTrang
        tieuDe="Nhận lead"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Mọi lead từ form, landing page, webhook và nhập tay đi qua một cửa: chuẩn hóa, dò trùng, gắn chiến dịch, chia sale, tạo việc gọi lại."
        hanhDong={
          coQuyen(nd.hoSo, "marketing.create") && (
            <Link className="nut chinh" href="/marketing/nhan-lead/nhap-tay">
              <BieuTuong ten="them" co={16} /> Nhập tay lead
            </Link>
          )
        }
      />
      <div className="luoi-the">
        <section className="the">
          <div className="dau">
            <h2>Sale nhận lead (chia vòng tròn)</h2>
          </div>
          <DanhSachNhanLead banDau={ch.danhSach.filter((d) => d.conHieuLuc)} ungVien={ch.ungVien} duocSua={ch.duocSua} />
          {ch.danhSach.some((d) => !d.conHieuLuc) && (
            <p className="hop-thong-bao canh-bao" style={{ margin: "0 16px 16px" }}>
              Có người trong danh sách đã nghỉ hoặc mất quyền xem lead — hệ thống bỏ qua họ khi chia.
            </p>
          )}
        </section>
        <section className="the">
          <div className="dau">
            <h2>Luật nhận lead</h2>
          </div>
          <div className="than">
            <p className="phu" style={{ marginBottom: 8 }}>
              <strong>Hạn gọi lại:</strong>{" "}
              {ch.phutGoiLai === null ? (
                <span className="huy-hieu canh-bao">Chưa đặt — việc gọi lại được tạo nhưng không có hạn</span>
              ) : (
                `${dinhDangSo(ch.phutGoiLai)} phút sau khi nhận`
              )}{" "}
              {coQuyen(nd.hoSo, "setting.view") && <Link href="/quan-tri/cau-hinh">Cấu hình</Link>}
            </p>
            <ul className="phu" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Trùng SĐT / email / MST với lead đang mở → ghi thêm tương tác vào lead đó, báo người phụ trách, không tạo lead mới.</li>
              <li>Trùng khách hàng / liên hệ đã có → vẫn tạo lead (nhu cầu mới), gắn cảnh báo, giao người phụ trách khách.</li>
              <li>Còn lại → chia vòng tròn theo danh sách bên cạnh.</li>
              <li>utm_campaign khớp mã của chiến dịch → lead gắn vào chiến dịch đó.</li>
            </ul>
          </div>
        </section>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Nhật ký nhận lead</h2>
          <span className="phu nho">{dinhDangSo(nk.tong)} lần</span>
        </div>
        <form className="bo-loc" method="get">
          <div className="truong">
            <label htmlFor="kenh">Kênh</label>
            <select id="kenh" name="kenh" defaultValue={kenh}>
              <option value="">Tất cả</option>
              {KENH_NHAN.map((k) => (
                <option key={k} value={k}>
                  {NHAN_KENH_NHAN[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="ketQua">Kết quả</label>
            <select id="ketQua" name="ketQua" defaultValue={ketQua}>
              <option value="">Tất cả</option>
              {Object.entries(NHAN_KET_QUA_NHAN).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {chienDichId && <input type="hidden" name="chienDichId" value={chienDichId} />}
          {webhookSourceId && <input type="hidden" name="webhookSourceId" value={webhookSourceId} />}
          {formId && <input type="hidden" name="formId" value={formId} />}
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/marketing/nhan-lead">
              Xóa lọc
            </Link>
          )}
        </form>
        {nk.dong.length === 0 ? (
          <TrongRong tieuDe="Chưa có lần nhận nào" />
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Lúc</th>
                  <th>Kênh</th>
                  <th>Kết quả</th>
                  <th>Lead</th>
                  <th className="an-tren-dt">Chiến dịch / UTM</th>
                  <th className="an-tren-dt">Giao cho</th>
                </tr>
              </thead>
              <tbody>
                {nk.dong.map((d) => (
                  <tr key={d.id}>
                    <td className="nho">{dinhDangNgayGio(d.luc)}</td>
                    <td>
                      {NHAN_KENH_NHAN[d.kenh] ?? d.kenh}
                      {d.noiNhan && <div className="dong-phu">{d.noiNhan}</div>}
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_KET_QUA[d.ketQua] ?? ""}`}>{NHAN_KET_QUA_NHAN[d.ketQua] ?? d.ketQua}</span>
                      {d.lyDo && <div className="dong-phu">{d.lyDo}</div>}
                    </td>
                    <td>
                      {d.lead ? (
                        <>
                          {coQuyen(nd.hoSo, "crm.view") ? <Link href={`/crm/lead/${d.lead.id}`}>{d.lead.hoTen}</Link> : d.lead.hoTen}
                          <div className="dong-phu">
                            {d.lead.ma} · {d.lead.dienThoai ?? d.lead.email ?? "—"}
                          </div>
                        </>
                      ) : (
                        <span className="mo">—</span>
                      )}
                    </td>
                    <td className="an-tren-dt">
                      {d.chienDich ? <Link href={`/marketing/chien-dich/${d.chienDich.id}`}>{d.chienDich.ma}</Link> : <span className="mo">—</span>}
                      {(d.utmSource || d.utmCampaign) && (
                        <div className="dong-phu">
                          {d.utmSource ?? ""} {d.utmCampaign ? `/ ${d.utmCampaign}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="an-tren-dt">{d.nguoiNhan ?? <span className="mo">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang tong={nk.tong} trang={nk.trang} coTrang={nk.coTrang} duongDan="/marketing/nhan-lead" thamSo={{ kenh, ketQua, chienDichId, webhookSourceId, formId }} />
      </section>
    </>
  );
}
