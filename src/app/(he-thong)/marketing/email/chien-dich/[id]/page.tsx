import Link from "next/link";
import { notFound } from "next/navigation";
import KhungXemThu from "@/components/email/KhungXemThu";
import { thamSoTuChienDich } from "@/components/email/tham-so-nguoi-nhan";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { LuocDoLocNguoiNhan } from "@/modules/email/luoc-do";
import { chiTietChienDich, quyenGiaoDienEmail } from "@/modules/email/service";
import { luaChonPhanKhuc } from "@/modules/marketing/service";
import {
  LOP_TRANG_THAI_CHIEN_DICH,
  LOP_TRANG_THAI_NGUOI_NHAN,
  NHAN_LY_DO_LOAI,
  NHAN_NHOM_TEN_MIEN,
  NHAN_TRANG_THAI_CHIEN_DICH,
  NHAN_TRANG_THAI_NGUOI_NHAN,
  type LyDoLoai,
} from "@/modules/email/tinh-toan";
import SuaNhap from "./SuaNhap";
import TacVuChienDich from "./TacVuChienDich";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TT_NN = ["QUEUED", "SENDING", "SENT", "FAILED", "SKIPPED"];

export default async function TrangChiTietChienDich({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("marketing.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const loc = LuocDoLocNguoiNhan.parse({ trangThai: TT_NN.includes(tt) ? tt : "", trang: layMot(sp.trang) || 1 });

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const [c, dl, pk] = await Promise.all([
        chiTietChienDich(nc, id, loc),
        luaChonDuLieuGoc(nc, ["nguon_lead", "phan_khuc_khach_hang", "nganh_nghe"]),
        luaChonPhanKhuc(nc),
      ]);
      return { c, dl, pk };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();
  const { c } = du;
  const q = quyenGiaoDienEmail(nd.hoSo);

  const viec: ("gui-duyet" | "tra-ve" | "duyet" | "tam-dung" | "tiep-tuc" | "huy")[] = [];
  if (c.trangThai === "DRAFT" && q.sua) viec.push("gui-duyet");
  if (c.trangThai === "PENDING_APPROVAL" && q.duyet) viec.push("duyet", "tra-ve");
  if (c.trangThai === "SENDING" && q.sua) viec.push("tam-dung");
  if (c.trangThai === "PAUSED" && q.duyet) viec.push("tiep-tuc");
  if ((["DRAFT", "PENDING_APPROVAL"].includes(c.trangThai) && q.sua) || (["SENDING", "PAUSED"].includes(c.trangThai) && q.duyet)) viec.push("huy");

  const tk = c.thongKe;
  const tomTat = Object.entries(c.tomTatLoai).filter(([k, v]) => k !== "hopLe" && v > 0);

  return (
    <>
      <DauTrang
        tieuDe={`${c.ma} · ${c.ten}`}
        duongDan={[{ nhan: "Marketing" }, { nhan: "Đợt gửi email", href: "/marketing/email/chien-dich" }]}
        moTa={
          <>
            <span className={`huy-hieu ${LOP_TRANG_THAI_CHIEN_DICH[c.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_CHIEN_DICH[c.trangThai]}</span> · Người nhận: {c.moTaNguon}
            {c.mau && (
              <>
                {" "}
                · Mẫu: <Link href={`/marketing/email/mau/${c.mau.id}`}>{c.mau.name}</Link>
              </>
            )}
          </>
        }
        hanhDong={viec.length ? <TacVuChienDich id={c.id} ma={c.ma} viec={viec} /> : null}
      />

      {c.trangThai === "PAUSED" && c.lyDoDung && (
        <div className="hop-thong-bao canh-bao" role="status" style={{ marginBottom: 16 }}>
          {c.lyDoDung}
        </div>
      )}
      {c.trangThai === "CANCELLED" && (
        <div className="hop-thong-bao" role="status" style={{ marginBottom: 16 }}>
          Đã huỷ {dinhDangNgayGio(c.huyLuc)}: {c.lyDoHuy}
        </div>
      )}
      {c.trangThai === "PENDING_APPROVAL" && !q.duyet && (
        <div className="hop-thong-bao" role="status" style={{ marginBottom: 16 }}>
          Đang chờ người có quyền duyệt marketing (Trưởng phòng Marketing / Giám đốc).
        </div>
      )}

      {c.duyetLuc && (
        <div className="luoi-chi-so">
          <div className="the chi-so">
            <div className="nhan">Đã gửi</div>
            <div className="gia-tri">
              {dinhDangSo(tk.daGui)}/{dinhDangSo(tk.tong - tk.biLoai)}
            </div>
            <div className="ghi-chu">còn chờ {dinhDangSo(tk.choGui + tk.dangGui)}</div>
          </div>
          <div className={`the chi-so ${tk.loi ? "canh-bao" : ""}`}>
            <div className="nhan">Lỗi</div>
            <div className="gia-tri">{dinhDangSo(tk.loi)}</div>
            <div className="ghi-chu">bị loại {dinhDangSo(tk.biLoai)}</div>
          </div>
          <div className="the chi-so">
            <div className="nhan">Mở / bấm</div>
            <div className="gia-tri">
              {c.theoDoi ? `${dinhDangSo(tk.mo)} / ${dinhDangSo(tk.bam)}` : "—"}
            </div>
            <div className="ghi-chu">{c.theoDoi ? "người nhận đã mở / đã bấm liên kết" : "chiến dịch này không bật theo dõi"}</div>
          </div>
          <div className="the chi-so">
            <div className="nhan">Huỷ nhận tin</div>
            <div className="gia-tri">{dinhDangSo(tk.huyNhanTin)}</div>
          </div>
          <div className={`the chi-so ${tk.hong || tk.baoRac ? "canh-bao" : ""}`}>
            <div className="nhan">Trả lại / báo rác</div>
            <div className="gia-tri">
              {dinhDangSo(tk.hong)} / {dinhDangSo(tk.baoRac)}
            </div>
            <div className="ghi-chu">tới hộp thư {dinhDangSo(tk.denHop)} (chỉ có khi gửi qua Amazon SES)</div>
          </div>
        </div>
      )}

      {c.hanMuc && (
        <p className="nho phu" style={{ margin: "0 0 12px" }}>
          Hạn mức hôm nay: {dinhDangSo(c.hanMuc.moiPhut)} thư/phút
          {c.hanMuc.tranHomNay !== null
            ? ` · trần ${dinhDangSo(c.hanMuc.tranHomNay)} thư/ngày (đã gửi ${dinhDangSo(c.hanMuc.daGuiHomNay)})${c.hanMuc.khoiDong ? ` · đang khởi động, ngày thứ ${c.hanMuc.khoiDong.ngayThu}` : ""}${c.hanMuc.tranNgayMacDinhSes ? " · trần mặc định khi dùng SES" : ""}`
            : " · không chặn theo ngày"}
          {` · mỗi địa chỉ tối đa ${c.hanMuc.toiDaMoiDiaChi24h} thư quảng cáo/24 giờ (quá thì hoãn, không lỗi).`}
        </p>
      )}

      {c.theoTenMien && (
        <section className="the">
          <div className="dau">
            <h2>Theo tên miền nhận</h2>
          </div>
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Tên miền</th>
                  <th className="so">Đã gửi</th>
                  <th className="so">Tới hộp thư</th>
                  <th className="so">Trả lại</th>
                  <th className="so">Báo rác</th>
                  <th className="so">Đã mở</th>
                </tr>
              </thead>
              <tbody>
                {c.theoTenMien.map((t) => (
                  <tr key={t.nhom}>
                    <td>{NHAN_NHOM_TEN_MIEN[t.nhom]}</td>
                    <td className="so">{dinhDangSo(t.daGui)}</td>
                    <td className="so">{dinhDangSo(t.denHop)}</td>
                    <td className="so">{dinhDangSo(t.hong)}</td>
                    <td className="so">{dinhDangSo(t.baoRac)}</td>
                    <td className="so">{c.theoDoi ? dinhDangSo(t.mo) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {c.trangThai === "DRAFT" && q.sua ? (
        <SuaNhap
          id={c.id}
          ten={c.ten}
          tieuDe={c.tieuDe}
          khoi={c.khoi}
          thamSo={thamSoTuChienDich(c.nguon, c.thamSo)}
          luaChon={{ nguon: du.dl["nguon_lead"] ?? [], phanKhuc: du.dl["phan_khuc_khach_hang"] ?? [], nganh: du.dl["nganh_nghe"] ?? [] }}
          xemLead={q.xemLead}
          xemLienHe={q.xemLienHe}
          dsPhanKhuc={du.pk}
          xemPhanKhuc={q.phanKhuc}
          emailCuaToi={nd.hoSo.email}
          duocGuiThu={q.tao}
        />
      ) : (
        <div className="luoi-ben-phai">
          <div>
            <section className="the">
              <div className="dau">
                <h2>Người nhận ({dinhDangSo(c.nguoiNhan.tong)})</h2>
              </div>
              {c.duyetLuc ? (
                <>
                  <form className="bo-loc" method="get">
                    <div className="truong">
                      <label htmlFor="trangThai">Trạng thái</label>
                      <select id="trangThai" name="trangThai" defaultValue={loc.trangThai}>
                        <option value="">Tất cả</option>
                        {TT_NN.map((t) => (
                          <option key={t} value={t}>
                            {NHAN_TRANG_THAI_NGUOI_NHAN[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="nut" type="submit">
                      Lọc
                    </button>
                  </form>
                  {tomTat.length > 0 && (
                    <p className="nho" style={{ padding: "0 16px" }}>
                      Lúc duyệt đã loại:{" "}
                      {tomTat.map(([k, v]) => (
                        <span key={k} className="huy-hieu" style={{ marginRight: 6 }}>
                          {NHAN_LY_DO_LOAI[k as LyDoLoai] ?? k}: {v}
                        </span>
                      ))}
                    </p>
                  )}
                  <div className="cuon-ngang">
                    <table className="bang">
                      <thead>
                        <tr>
                          <th>Người nhận</th>
                          <th>Trạng thái</th>
                          <th className="an-tren-dt">Tương tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.nguoiNhan.dong.map((r) => (
                          <tr key={r.id}>
                            <td>
                              {r.leadId ? <Link href={`/crm/lead/${r.leadId}`}>{r.ten}</Link> : r.khachHangId ? <Link href={`/crm/khach-hang/${r.khachHangId}`}>{r.ten}</Link> : r.ten}
                              <div className="dong-phu">
                                {r.email}
                                {r.congTy ? ` · ${r.congTy}` : ""}
                              </div>
                            </td>
                            <td>
                              <span className={`huy-hieu ${LOP_TRANG_THAI_NGUOI_NHAN[r.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_NGUOI_NHAN[r.trangThai]}</span>
                              {r.guiLuc && <div className="dong-phu">{dinhDangNgayGio(r.guiLuc)}</div>}
                              {r.lyDo && <div className="dong-phu chu-loi">{r.lyDo}</div>}
                            </td>
                            <td className="an-tren-dt nho">
                              {[r.moLuc && "Đã mở", r.bamLuc && "Đã bấm", r.huyLuc && "Đã huỷ nhận tin"].filter(Boolean).join(" · ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PhanTrang
                    tong={c.nguoiNhan.tong}
                    trang={c.nguoiNhan.trang}
                    coTrang={c.nguoiNhan.coTrang}
                    duongDan={`/marketing/email/chien-dich/${c.id}`}
                    thamSo={{ trangThai: loc.trangThai }}
                  />
                </>
              ) : (
                <div className="than">
                  <p className="phu">Danh sách người nhận được chốt lúc duyệt. Điều kiện: {c.moTaNguon}.</p>
                </div>
              )}
            </section>
            <section className="the">
              <div className="dau">
                <h2>Nhật ký</h2>
              </div>
              <div className="than nho">
                <p>
                  Lập {dinhDangNgayGio(c.lapLuc)} bởi {c.nguoiLap ?? "—"}
                </p>
                {c.guiDuyetLuc && <p>Gửi duyệt {dinhDangNgayGio(c.guiDuyetLuc)}</p>}
                {c.duyetLuc && (
                  <p>
                    Duyệt {dinhDangNgayGio(c.duyetLuc)} bởi {c.nguoiDuyet ?? "—"}
                  </p>
                )}
                {c.xongLuc && <p>Gửi xong {dinhDangNgayGio(c.xongLuc)}</p>}
              </div>
            </section>
          </div>
          <div>
            <section className="the">
              <div className="dau">
                <h2>Nội dung thư</h2>
              </div>
              <div className="than">
                {c.xemTruoc.thieuChanThu.length > 0 && (
                  <div className="hop-thong-bao canh-bao" role="status">
                    Hồ sơ công ty chưa khai {c.xemTruoc.thieuChanThu.join(" và ")}.
                  </div>
                )}
                <p className="nho">
                  <strong>Tiêu đề:</strong> {c.xemTruoc.tieuDe}
                </p>
                <KhungXemThu html={c.xemTruoc.html} tieuDe={c.xemTruoc.tieuDe} />
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
