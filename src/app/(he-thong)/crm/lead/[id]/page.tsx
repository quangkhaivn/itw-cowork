import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import GhiTuongTac from "@/components/crm/GhiTuongTac";
import NutTaoViec from "@/components/crm/NutTaoViec";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangTien } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc, danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { LOP_GIAI_DOAN, NHAN_GIAI_DOAN, NHAN_TRANG_THAI_VIEC, NHAN_TUONG_TAC, NHAN_UU_TIEN } from "@/modules/crm/hang-so";
import { chiTietLead } from "@/modules/lead/service";
import FormLead from "../FormLead";
import TacVuLead from "./TacVuLead";
import NutDongYNhanTin from "@/components/marketing/NutDongYNhanTin";
import { thongTinMarketingLead } from "@/modules/marketing/service";
import { NHAN_KENH_NHAN } from "@/modules/marketing/hang-so";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangChiTietLead({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("crm.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const sp = await searchParams;
  const moTao = layMot(sp.moTao) === "1";

  const duLieu = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const d = await chiTietLead(nc, id);
      const luaChon = await luaChonDuLieuGoc(nc, ["nguon_lead", "phan_khuc_khach_hang", "loai_khach_hang"]);
      const tenNguon = (await banDoTenDuLieuGoc(nc, ["nguon_lead"])).nguon_lead;
      const nguoiSua = d.quyen.sua ? await danhSachNguoiPhuTrach(nc, "crm.update") : [];
      const nguoiViec = d.quyen.taoViec ? await danhSachNguoiPhuTrach(nc, "task.create") : [];
      // 0.16.0 — nguồn marketing của lead (kênh nhận, chiến dịch, UTM, đồng ý nhận tin).
      const mk = await thongTinMarketingLead(nc, id);
      return { ...d, luaChon, tenNguon, nguoiSua, nguoiViec, mk };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!duLieu) notFound();
  const { lead, tuongTac, viec, quyen, luaChon, tenNguon, nguoiSua, nguoiViec } = duLieu;

  return (
    <>
      <DauTrang
        tieuDe={lead.congTy ? `${lead.hoTen} — ${lead.congTy}` : lead.hoTen}
        duongDan={[{ nhan: "CRM" }, { nhan: "Lead", href: "/crm/lead" }]}
        moTa={
          <>
            {lead.ma} · <span className={`huy-hieu ${LOP_GIAI_DOAN[lead.giaiDoan] ?? ""}`}>{NHAN_GIAI_DOAN[lead.giaiDoan]}</span> · Phụ trách:{" "}
            {lead.nguoiPhuTrach.hoTen} · Nguồn: {lead.nguon ? (tenNguon[lead.nguon] ?? lead.nguon) : "—"}
          </>
        }
        hanhDong={quyen.taoViec && <NutTaoViec ganKem={{ leadId: lead.id }} nguoiPhuTrach={nguoiViec} toiId={nd.hoSo.userId} />}
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã tạo lead {lead.ma}. Ghi cuộc gọi đầu tiên bên dưới — lead sẽ tự chuyển sang “Đã liên hệ”.
        </div>
      )}
      {lead.giaiDoan === "CONVERTED" && (
        <div className="hop-thong-bao thong-tin">
          Đã chuyển đổi lúc {dinhDangNgayGio(lead.chuyenDoiLuc)}
          {lead.khachHang && (
            <>
              {" "}thành khách hàng <Link href={`/crm/khach-hang/${lead.khachHang.id}`}>{lead.khachHang.ma} — {lead.khachHang.ten}</Link>
            </>
          )}
          {lead.coHoi && (
            <>
              {" "}và cơ hội <Link href={`/ban-hang/co-hoi/${lead.coHoi.id}`}>{lead.coHoi.ma}</Link>
            </>
          )}
          . Lead đã chuyển đổi không sửa được nữa.
        </div>
      )}
      {lead.giaiDoan === "DISQUALIFIED" && (
        <div className="hop-thong-bao canh-bao">Lead đã bị loại. Lý do: {lead.lyDoLoai}</div>
      )}

      <div className="luoi-ben-phai">
        <div>
          {quyen.sua ? (
            <FormLead
              nguon={luaChon.nguon_lead}
              nguoiPhuTrach={nguoiSua}
              banDau={{
                id: lead.id,
                hoTen: lead.hoTen,
                congTy: lead.congTy ?? "",
                chucDanh: lead.chucDanh ?? "",
                dienThoai: lead.dienThoai ?? "",
                email: lead.email ?? "",
                maSoThue: lead.maSoThue ?? "",
                nguon: lead.nguon ?? "",
                nhuCau: lead.nhuCau ?? "",
                giaTriUocTinh: lead.giaTriUocTinh ? String(Math.round(Number(lead.giaTriUocTinh))) : "",
                nguoiPhuTrachId: lead.nguoiPhuTrach.id,
                ghiChu: lead.ghiChu ?? "",
              }}
            />
          ) : (
            <section className="the">
              <dl className="bang-thong-tin">
                <dt>Điện thoại</dt>
                <dd>{lead.dienThoai ?? "—"}</dd>
                <dt>Email</dt>
                <dd>{lead.email ?? "—"}</dd>
                <dt>Chức danh</dt>
                <dd>{lead.chucDanh ?? "—"}</dd>
                <dt>Mã số thuế</dt>
                <dd>{lead.maSoThue ?? "—"}</dd>
                <dt>Ước tính</dt>
                <dd>{lead.giaTriUocTinh ? dinhDangTien(lead.giaTriUocTinh) : "—"}</dd>
                <dt>Nhu cầu</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{lead.nhuCau ?? "—"}</dd>
                <dt>Ghi chú</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{lead.ghiChu ?? "—"}</dd>
              </dl>
            </section>
          )}

          <section className="the">
            <div className="dau">
              <h2>Nguồn marketing</h2>
              {duLieu.mk.duocDoiDongY && <NutDongYNhanTin doiTuong="lead" id={lead.id} dangDongY={duLieu.mk.dongYNhanTin} />}
            </div>
            <dl className="bang-thong-tin">
              <dt>Kênh nhận</dt>
              <dd>
                {duLieu.mk.kenhNhan ? NHAN_KENH_NHAN[duLieu.mk.kenhNhan] : "Nhập trong CRM"}
                {duLieu.mk.soLanDangKy > 1 && ` · đăng ký ${duLieu.mk.soLanDangKy} lần`}
              </dd>
              <dt>Chiến dịch</dt>
              <dd>{duLieu.mk.chienDich ? `${duLieu.mk.chienDich.ma} — ${duLieu.mk.chienDich.ten}` : "—"}</dd>
              {(duLieu.mk.utm.utm_source || duLieu.mk.utm.utm_campaign) && (
                <>
                  <dt>UTM</dt>
                  <dd>{Object.entries(duLieu.mk.utm).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(" · ")}</dd>
                </>
              )}
              {duLieu.mk.khachTrung && (
                <>
                  <dt>Trùng khách</dt>
                  <dd>
                    <span className="huy-hieu canh-bao">Đã có khách</span> <Link href={`/crm/khach-hang/${duLieu.mk.khachTrung.id}`}>{duLieu.mk.khachTrung.ma} — {duLieu.mk.khachTrung.ten}</Link>
                  </dd>
                </>
              )}
              <dt>Nhận tin marketing</dt>
              <dd>
                {duLieu.mk.tuChoiLuc ? (
                  <span className="huy-hieu loi">Đã từ chối {dinhDangNgayGio(duLieu.mk.tuChoiLuc)}</span>
                ) : duLieu.mk.dongYNhanTin ? (
                  <span className="huy-hieu tot">Đồng ý {dinhDangNgayGio(duLieu.mk.dongYLuc)}</span>
                ) : (
                  <span className="huy-hieu">Chưa đồng ý</span>
                )}
                {duLieu.mk.nguonDongY && <span className="phu nho"> · {duLieu.mk.nguonDongY}</span>}
              </dd>
            </dl>
          </section>

          <section className="the">
            <div className="dau">
              <h2>Tương tác</h2>
            </div>
            {quyen.ghiTuongTac && (
              <div className="than" style={{ borderBottom: "1px solid var(--vien)" }}>
                <GhiTuongTac leadId={lead.id} />
              </div>
            )}
            {tuongTac.length === 0 ? (
              <TrongRong tieuDe="Chưa liên hệ lần nào" />
            ) : (
              <ul className="ds-tuong-tac">
                {tuongTac.map((t) => (
                  <li key={t.id}>
                    <div className="dau-dong">
                      <span className="huy-hieu">{NHAN_TUONG_TAC[t.loai] ?? t.loai}</span>
                      <strong>{t.tieuDe}</strong>
                      <span className="phu">
                        {dinhDangNgayGio(t.luc)} · {t.nguoi}
                      </span>
                    </div>
                    {t.noiDung && <p>{t.noiDung}</p>}
                    {t.ketQua && <p className="phu">Kết quả: {t.ketQua}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <TacVuLead
            lead={{
              id: lead.id,
              ma: lead.ma,
              hoTen: lead.hoTen,
              congTy: lead.congTy,
              maSoThue: lead.maSoThue,
              nhuCau: lead.nhuCau,
              giaTriUocTinh: lead.giaTriUocTinh,
              giaiDoan: lead.giaiDoan,
            }}
            quyen={quyen}
            luaChon={luaChon}
          />
          <section className="the">
            <div className="dau">
              <h2>Công việc</h2>
            </div>
            {viec.length === 0 ? (
              <div className="than phu">Chưa có công việc.</div>
            ) : (
              <table className="bang">
                <tbody>
                  {viec.map((v) => (
                    <tr key={v.id} className={v.trangThai === "xong" || v.trangThai === "huy" ? "mo" : undefined}>
                      <td>
                        <Link href={`/cong-viec?id=${v.id}`}>{v.tieuDe}</Link>
                        <div className="dong-phu">
                          {v.nguoi} · {NHAN_UU_TIEN[v.uuTien]} · {v.han ? dinhDangNgayGio(v.han) : "không hạn"}
                        </div>
                      </td>
                      <td>
                        <span className="huy-hieu">{NHAN_TRANG_THAI_VIEC[v.trangThai]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
