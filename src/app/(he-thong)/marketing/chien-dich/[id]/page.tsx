import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangNgayGio, dinhDangPhanTram, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { LOP_GIAI_DOAN, NHAN_GIAI_DOAN } from "@/modules/crm/hang-so";
import { LOP_TRANG_THAI_CHIEN_DICH, NHAN_KENH, NHAN_KENH_NHAN, NHAN_LOAI_CHI_PHI, NHAN_TRANG_THAI_CHIEN_DICH } from "@/modules/marketing/hang-so";
import { chiTietChienDich } from "@/modules/marketing/service";
import TacVuChienDich, { NutHuyChiPhi } from "./TacVuChienDich";

export const dynamic = "force-dynamic";

export default async function TrangChiTietChienDich({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nd = await yeuCauQuyen("marketing.view");
  const ct = await docDuLieu(nd, (tx) => chiTietChienDich(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id));
  const c = ct.chienDich;
  const s = ct.chiSo;
  return (
    <>
      <DauTrang
        tieuDe={c.ten}
        duongDan={[{ nhan: "Marketing" }, { nhan: "Chiến dịch", href: "/marketing/chien-dich" }]}
        moTa={
          <>
            {c.ma} · {NHAN_KENH[c.kenh] ?? c.kenh} · phụ trách {c.nguoiPhuTrach.hoTen}
            {c.utmCampaign && (
              <>
                {" · "}utm_campaign <code>{c.utmCampaign}</code>
              </>
            )}{" "}
            · <span className={`huy-hieu ${LOP_TRANG_THAI_CHIEN_DICH[c.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_CHIEN_DICH[c.trangThai]}</span>
          </>
        }
        hanhDong={
          ct.quyen.sua && (
            <Link className="nut" href={`/marketing/chien-dich/${id}/sua`}>
              Sửa
            </Link>
          )
        }
      />
      {c.trangThai === "huy" && c.lyDoHuy && <div className="hop-thong-bao loi">Đã hủy: {c.lyDoHuy}</div>}
      {ct.canDuyet && c.trangThai !== "huy" && (
        <div className="hop-thong-bao canh-bao">
          Ngân sách {dinhDangTien(c.nganSach)} {c.nganSachDaDuyet ? `vượt mức đã duyệt ${dinhDangTien(c.nganSachDaDuyet)}` : "chưa được duyệt"} — chiến dịch chưa chạy được cho tới khi Trưởng phòng Marketing / Giám đốc duyệt.
        </div>
      )}
      {ct.vuotNganSach > 0 && <div className="hop-thong-bao canh-bao">Đã chi vượt ngân sách {dinhDangTien(ct.vuotNganSach)}.</div>}
      <TacVuChienDich id={id} buocKeTiep={ct.quyen.buocKeTiep} duocDuyet={ct.quyen.duyet} ghiChiPhi={ct.quyen.ghiChiPhi} />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Ngân sách / đã chi</div>
          <div className="gia-tri">{dinhDangTien(s.chiPhi)}</div>
          <div className="ghi-chu">
            ngân sách {Number(c.nganSach) > 0 ? dinhDangTien(c.nganSach) : "chưa đặt"}
            {c.nganSachDaDuyet && ` · đã duyệt ${dinhDangTien(c.nganSachDaDuyet)} lúc ${dinhDangNgayGio(c.duyetLuc)}`}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Lead</div>
          <div className="gia-tri">{dinhDangSo(s.soLead)}</div>
          <div className="ghi-chu">
            {c.mucTieuLead ? `mục tiêu ${dinhDangSo(c.mucTieuLead)} · ` : ""}
            {dinhDangSo(s.soDuDieuKien)} đủ điều kiện ({s.tyLeDuDieuKien === null ? "—" : dinhDangPhanTram(s.tyLeDuDieuKien)})
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">CPL</div>
          <div className="gia-tri">{s.cpl === null ? "—" : dinhDangTien(s.cpl)}</div>
          <div className="ghi-chu">{s.cpl === null ? "chưa có lead" : "chi phí / lead"}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Chuyển đổi thành khách</div>
          <div className="gia-tri">{dinhDangSo(s.soChuyenDoi)}</div>
          <div className="ghi-chu">{s.tyLeChuyenDoi === null ? "chưa có lead" : `${dinhDangPhanTram(s.tyLeChuyenDoi)} số lead`}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">ROAS</div>
          <div className="gia-tri">{s.roas === null ? "—" : `${dinhDangSo(s.roas)} lần`}</div>
          <div className="ghi-chu">
            doanh thu {dinhDangTien(s.doanhThu)} · cơ hội thắng {dinhDangTien(s.giaTriCoHoiThang)}
          </div>
        </div>
      </div>

      <div className="luoi-the">
        <section className="the">
          <div className="dau">
            <h2>Chi phí</h2>
          </div>
          {ct.chiPhi.length === 0 ? (
            <TrongRong tieuDe="Chưa ghi khoản chi nào" />
          ) : (
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Khoản</th>
                    <th className="so">Số tiền</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ct.chiPhi.map((k) => (
                    <tr key={k.id} className={k.trangThai === "huy" ? "mo" : undefined}>
                      <td className="nho">{dinhDangNgay(k.ngay)}</td>
                      <td>
                        {NHAN_LOAI_CHI_PHI[k.loai] ?? k.loai}
                        {k.ghiChu && <div className="dong-phu">{k.ghiChu}</div>}
                        {k.trangThai === "huy" && <div className="dong-phu">Đã hủy: {k.lyDoHuy}</div>}
                      </td>
                      <td className="so">{k.trangThai === "huy" ? <s>{dinhDangTien(k.soTien)}</s> : dinhDangTien(k.soTien)}</td>
                      <td>{k.trangThai === "hoat-dong" && ct.quyen.ghiChiPhi && <NutHuyChiPhi id={k.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="the">
          <div className="dau">
            <h2>Nguồn quảng cáo (UTM)</h2>
          </div>
          {ct.utm.length === 0 ? (
            <TrongRong tieuDe="Chưa có lead" />
          ) : (
            <table className="bang">
              <thead>
                <tr>
                  <th>utm_source / utm_medium</th>
                  <th className="so">Lead</th>
                </tr>
              </thead>
              <tbody>
                {ct.utm.map((u, i) => (
                  <tr key={i}>
                    <td>
                      {u.nguon ?? <span className="mo">(trống)</span>} / {u.kenh ?? <span className="mo">(trống)</span>}
                    </td>
                    <td className="so">{dinhDangSo(u.soLead)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="than">
            <h3>Nơi nhận lead gắn chiến dịch</h3>
            {ct.forms.length + ct.nguonWebhook.length + ct.landing.length === 0 ? (
              <p className="phu">Chưa có form, webhook hay landing page nào gắn chiến dịch này.</p>
            ) : (
              <ul className="phu" style={{ margin: 0, paddingLeft: 18 }}>
                {ct.forms.map((f) => (
                  <li key={f.id}>
                    Form <Link href={`/marketing/form/${f.id}`}>{f.ten}</Link>
                  </li>
                ))}
                {ct.landing.map((p) => (
                  <li key={p.id}>
                    Landing <Link href={`/marketing/landing/${p.id}`}>{p.ten}</Link>
                  </li>
                ))}
                {ct.nguonWebhook.map((w) => (
                  <li key={w.id}>Webhook {w.ten}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Lead của chiến dịch (100 gần nhất)</h2>
          <Link className="nho" href={`/marketing/nhan-lead?chienDichId=${id}`}>
            Nhật ký nhận lead
          </Link>
        </div>
        {ct.leads.length === 0 ? (
          <TrongRong tieuDe="Chưa có lead nào gắn chiến dịch" />
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Liên lạc</th>
                  <th>Giai đoạn</th>
                  <th className="an-tren-dt">Kênh nhận</th>
                  <th className="an-tren-dt">Phụ trách</th>
                  <th className="an-tren-dt">Nhận lúc</th>
                </tr>
              </thead>
              <tbody>
                {ct.leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {ct.quyen.xemLienLac ? <Link href={`/crm/lead/${l.id}`}>{l.hoTen}</Link> : l.hoTen}
                      <div className="dong-phu">
                        {l.ma}
                        {l.congTy ? ` · ${l.congTy}` : ""}
                      </div>
                    </td>
                    <td>
                      {l.dienThoai ?? <span className="mo">—</span>}
                      {l.email && <div className="dong-phu">{l.email}</div>}
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_GIAI_DOAN[l.giaiDoan] ?? ""}`}>{NHAN_GIAI_DOAN[l.giaiDoan]}</span>
                    </td>
                    <td className="an-tren-dt">{l.kenhNhan ? NHAN_KENH_NHAN[l.kenhNhan] : <span className="mo">CRM</span>}</td>
                    <td className="an-tren-dt">{l.nguoiPhuTrach}</td>
                    <td className="an-tren-dt nho">{dinhDangNgayGio(l.taoLuc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ct.leads.some((l) => l.daChe) && <p className="phu nho" style={{ padding: "8px 16px", margin: 0 }}>Số điện thoại và email được che theo quyền của bạn (MK-15).</p>}
      </section>
    </>
  );
}
