import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import KhungDinhKem from "@/components/dinh-kem/KhungDinhKem";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { NHAN_DANH_GIA_KET_QUA, NHAN_TRANG_THAI_VIEC, NHAN_UU_TIEN } from "@/modules/crm/hang-so";
import { chiTietViec } from "@/modules/cong-viec/service";
import TacVuChiTietViec from "./TacVuChiTietViec";
import DanhSachKiemTra from "./DanhSachKiemTra";
import BaoTienDo from "./BaoTienDo";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import NutHanhDong from "@/components/danh-gia/NutHanhDong";
import { lichSuGiaoViec } from "@/modules/cong-viec/giao-viec";
import { NHAN_CHAT_LUONG, NHAN_DO_KHO, NHAN_TRANG_THAI_NHAN } from "@/modules/danh-gia/tinh-toan";

export const dynamic = "force-dynamic";

const LOP_TRANG_THAI: Record<string, string> = { mo: "", "dang-lam": "chinh", "cho-duyet": "canh-bao", xong: "tot", huy: "" };
const CHAT_LUONG = [5, 4, 3, 2, 1].map((d) => ({ giaTri: String(d), nhan: `${d} — ${NHAN_CHAT_LUONG[d]}` }));
const NHAN_HANH_DONG: Record<string, string> = { "gui-duyet": "Gửi duyệt", duyet: "Duyệt", "tra-lai": "Trả lại" };
const NHAN_GIA_HAN: Record<string, string> = { "cho-duyet": "Chờ người giao", "da-duyet": "Đã duyệt", "tu-choi": "Từ chối" };
const LOP_DANH_GIA: Record<string, string> = { dat: "tot", "mot-phan": "canh-bao", "khong-dat": "loi", "can-theo-doi": "chinh" };
const LOP_UU_TIEN: Record<string, string> = { khan: "loi", cao: "canh-bao", "trung-binh": "", thap: "" };

/**
 * Một công việc: ai giao, giao lúc nào, việc gì, kết quả ra sao (0.17.0 — CV-04 → CV-10).
 * Đây là nơi thông báo "được giao việc" và "việc đã xong" dẫn tới.
 */
export default async function TrangChiTietViec({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("task.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietViec(nc, id);
      const nguoiGiaoLai = ct.quyen.giaoLai ? await danhSachNguoiPhuTrach(nc, "task.update") : [];
      const ls = await lichSuGiaoViec(nc, id);
      const nguoiDuyetChon = ls.quyen.suaCauHinhDuyet
        ? await tx.user.findMany({ where: { status: "hoat-dong", isSystem: false }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } })
        : [];
      return { ...ct, nguoiGiaoLai, ls, nguoiDuyetChon };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const v = du.viec;
  const ls = du.ls;
  const chuaXong = v.trangThai === "mo" || v.trangThai === "dang-lam";
  // 0.20.0: đang chờ duyệt / đã duyệt thì thao tác 0.17 (sửa, mở lại, giao lại) không áp dụng.
  const khoaThaoTac = v.trangThai === "cho-duyet" || !!v.duyetLuc;
  const tiepTheoId = layMot(sp.tiepTheo);

  return (
    <>
      <DauTrang
        tieuDe={v.tieuDe}
        duongDan={[{ nhan: "Công việc", href: "/cong-viec" }]}
        moTa={
          <>
            <span className={`huy-hieu ${LOP_TRANG_THAI[v.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_VIEC[v.trangThai]}</span>{" "}
            {v.uuTien !== "trung-binh" && <span className={`huy-hieu ${LOP_UU_TIEN[v.uuTien]}`}>{NHAN_UU_TIEN[v.uuTien]}</span>}{" "}
            Người làm: <strong>{v.nguoiPhuTrach.hoTen}</strong>
            {v.nguoiGiao && v.nguoiGiao.id !== v.nguoiPhuTrach.id && <> · Người giao: {v.nguoiGiao.hoTen}</>}
          </>
        }
        hanhDong={
          // QĐ-137: người không phải người làm / người giao / quản lý trực tiếp / Giám đốc / Quản trị không đổi trạng thái.
          du.quyen.sua && !khoaThaoTac && (v.nguoiPhuTrach.id === nd.hoSo.userId || du.quyen.suaChamDiem) && (
            <TacVuChiTietViec
              id={v.id}
              tieuDe={v.tieuDe}
              trangThai={v.trangThai}
              ketQua={v.ketQua}
              danhGia={v.danhGia}
              nguoiPhuTrachId={v.nguoiPhuTrach.id}
              nguoiGiaoLai={du.nguoiGiaoLai.map((n) => ({ id: n.id, hoTen: n.fullName }))}
              kiemTraBanDau={du.kiemTra}
              moHoanThanh={layMot(sp.hoanThanh) === "1" && chuaXong}
            />
          )
        }
      />

      {layMot(sp.daXong) === "1" && v.trangThai === "xong" && (
        <div className="hop-thong-bao tot" role="status">
          Đã ghi kết quả và đánh dấu xong.
          {v.nguoiGiao && v.nguoiGiao.id !== v.nguoiPhuTrach.id && <> {v.nguoiGiao.hoTen} đã nhận được thông báo.</>}
          {tiepTheoId && /^[0-9a-f-]{36}$/i.test(tiepTheoId) && (
            <>
              {" "}
              <Link href={`/cong-viec/${tiepTheoId}`}>Mở việc tiếp theo đã hẹn</Link>
            </>
          )}
        </div>
      )}

      {v.trangThai === "cho-duyet" && (
        <div className="hop-thong-bao thong-tin" role="status">
          Việc đã làm xong và đang chờ duyệt — cấp {v.capDangCho}: {ls.nguoiDuyet.find((n) => n.cap === v.capDangCho)?.hoTen ?? "—"}
          {v.guiDuyetLuc ? ` (gửi lúc ${dinhDangNgayGio(v.guiDuyetLuc)})` : ""}. Người duyệt duyệt kèm chấm chất lượng, hoặc trả lại kèm lý do.
        </div>
      )}

      {v.trangThai === "xong" && !v.ketQua && (
        <div className="hop-thong-bao canh-bao" role="status">
          Việc này xong từ trước khi có luật ghi kết quả. Bấm “Ghi kết quả” để bổ sung — người sau mở hồ sơ khách sẽ biết lần đó đã làm gì.
        </div>
      )}

      {chuaXong && v.quaHan && (
        <div className="hop-thong-bao loi" role="status">
          Việc đã quá hạn ({dinhDangNgayGio(v.han)}). Làm ngay, hoặc dời hạn và báo người giao.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Giao lúc</div>
          <div className="gia-tri" style={{ fontSize: 16 }}>
            {dinhDangNgayGio(v.giaoLuc)}
          </div>
          <div className="ghi-chu">{v.nguoiGiao ? `bởi ${v.nguoiGiao.hoTen}` : "Hệ thống tự tạo"}</div>
        </div>
        <div className={`the chi-so ${v.quaHan ? "loi" : ""}`}>
          <div className="nhan">Hạn</div>
          <div className="gia-tri" style={{ fontSize: 16 }}>
            {v.han ? dinhDangNgayGio(v.han) : "Không hạn"}
          </div>
          <div className="ghi-chu">{v.xongLuc ? `Xong ${dinhDangNgayGio(v.xongLuc)}` : v.quaHan ? "Quá hạn" : "Chưa xong"}</div>
        </div>
        <div className={`the chi-so ${v.kiemTra.batBuocConThieu ? "canh-bao" : ""}`}>
          <div className="nhan">Danh sách kiểm tra</div>
          <div className="gia-tri">{v.kiemTra.tong ? `${v.kiemTra.daTich}/${v.kiemTra.tong}` : "—"}</div>
          <div className="ghi-chu">
            {v.kiemTra.tong === 0 ? "Không có mục nào" : v.kiemTra.batBuocConThieu ? `Còn ${v.kiemTra.batBuocConThieu} mục bắt buộc` : "Đủ mục bắt buộc"}
          </div>
        </div>
        {du.hoSoKhach && (
          <div className={`the chi-so ${du.hoSoKhach.thieuBatBuoc.length ? "canh-bao" : ""}`}>
            <div className="nhan">Hồ sơ khách</div>
            <div className="gia-tri">{du.hoSoKhach.diem}%</div>
            <div className="ghi-chu">{du.hoSoKhach.thieuBatBuoc.length ? `Thiếu: ${du.hoSoKhach.thieuBatBuoc.join(", ")}` : "Đủ thông tin bắt buộc"}</div>
          </div>
        )}
      </div>

      <div className="luoi-the">
        <section className="the">
          <div className="dau">
            <h2>Việc cần làm</h2>
          </div>
          <dl className="bang-thong-tin">
            <dt>Mô tả</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{v.moTa || <span className="phu">Không có ghi chú</span>}</dd>
            <dt>Khách hàng</dt>
            <dd>{v.khachHang ? <Link href={`/crm/khach-hang/${v.khachHang.id}`}>{v.khachHang.ten}</Link> : "—"}</dd>
            {v.lead && (
              <>
                <dt>Lead</dt>
                <dd>
                  <Link href={`/crm/lead/${v.lead.id}`}>{v.lead.ma}</Link> <span className="phu">{v.lead.ten}</span>
                </dd>
              </>
            )}
            {v.coHoi && (
              <>
                <dt>Cơ hội</dt>
                <dd>
                  <Link href={`/ban-hang/co-hoi/${v.coHoi.id}`}>{v.coHoi.ma}</Link> <span className="phu">{v.coHoi.ten}</span>
                </dd>
              </>
            )}
            <dt>Tạo lúc</dt>
            <dd>{dinhDangNgayGio(v.taoLuc)}</dd>
          </dl>
        </section>

        <section className="the">
          <div className="dau">
            <h2>Kết quả</h2>
            {v.danhGia && <span className={`huy-hieu ${LOP_DANH_GIA[v.danhGia] ?? ""}`}>{NHAN_DANH_GIA_KET_QUA[v.danhGia]}</span>}
          </div>
          <div className="than">
            {v.ketQua ? (
              <>
                <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{v.ketQua}</p>
                <p className="phu nho" style={{ marginBottom: 0 }}>
                  Ghi bởi {v.nguoiGhiKetQua?.hoTen ?? "—"} lúc {dinhDangNgayGio(v.ketQuaLuc)}
                </p>
              </>
            ) : (
              <p className="phu" style={{ margin: 0 }}>
                Chưa có kết quả. Khi xong việc, ghi lại đã làm gì, khách nói gì và bước tiếp theo — kết quả hiện luôn trên hồ sơ khách.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Giao nhận và duyệt</h2>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ls.quyen.suaCauHinhDuyet && chuaXong && (
              <FormNhanh nhanNut="Sửa độ khó / duyệt" tieuDe="Độ khó và người duyệt" url={`/api/v1/cong-viec/${v.id}`} phuongThuc="PATCH" lopNut="nut nho"
                truong={[
                  { ten: "doKho", nhan: "Độ khó", kieu: "select", luaChon: [1, 2, 3, 4, 5].map((d) => ({ giaTri: String(d), nhan: `${d} — ${NHAN_DO_KHO[d]}` })) },
                  { ten: "canDuyet", nhan: "Cần duyệt khi xong", kieu: "checkbox" },
                  { ten: "nguoiDuyetIds", nhan: "Người duyệt (chọn nhiều = nhiều cấp, theo thứ tự trong danh sách)", kieu: "nhieu", luaChon: du.nguoiDuyetChon.filter((n) => n.id !== v.nguoiPhuTrach.id).map((n) => ({ giaTri: n.id, nhan: n.fullName })) },
                ]}
                giaTriDau={{ doKho: String(v.doKho), canDuyet: v.canDuyet, nguoiDuyetIds: ls.nguoiDuyet.map((n) => n.id) }} />
            )}
            {ls.quyen.nhan && <NutHanhDong url={`/api/v1/cong-viec/${v.id}/nhan`} nhan="Nhận việc" lopNut="nut chinh nho" />}
            {ls.quyen.nhan && (
              <FormNhanh nhanNut="Từ chối" tieuDe="Từ chối việc" url={`/api/v1/cong-viec/${v.id}/tu-choi`} lopNut="nut nho"
                truong={[{ ten: "lyDo", nhan: "Lý do từ chối", kieu: "textarea", batBuoc: true, caDong: true, goiY: "Việc quay về người giao để giao lại hoặc sửa." }]} />
            )}
            {ls.quyen.baoTienDo && <BaoTienDo id={v.id} tienDo={v.tienDo} />}
            {ls.quyen.xinGiaHan && (
              <FormNhanh nhanNut="Xin gia hạn" tieuDe="Xin gia hạn" url={`/api/v1/cong-viec/${v.id}/gia-han`} lopNut="nut nho"
                truong={[
                  { ten: "hanMoi", nhan: "Hạn mới", kieu: "datetime-local", batBuoc: true },
                  { ten: "lyDo", nhan: "Lý do", kieu: "textarea", batBuoc: true, caDong: true },
                ]} />
            )}
            {ls.quyen.duyet && (
              <FormNhanh nhanNut="Duyệt + chấm điểm" tieuDe="Duyệt việc" url={`/api/v1/cong-viec/${v.id}/duyet`} lopNut="nut chinh nho"
                truong={[
                  { ten: "chatLuong", nhan: "Chất lượng", kieu: "select", luaChon: CHAT_LUONG, caDong: true, goiY: "Điểm việc = độ khó × chất lượng × hệ số đúng hạn (máy tự tính đúng hạn theo hạn cuối cùng)." },
                  { ten: "nhanXet", nhan: "Nhận xét", kieu: "textarea", caDong: true },
                ]}
                giaTriDau={{ chatLuong: "4" }} />
            )}
            {ls.quyen.duyet && (
              <FormNhanh nhanNut="Trả lại" tieuDe="Trả lại việc" url={`/api/v1/cong-viec/${v.id}/tra-lai`} lopNut="nut nho"
                truong={[{ ten: "lyDo", nhan: "Lý do trả lại", kieu: "textarea", batBuoc: true, caDong: true, goiY: "Việc về Đang làm; người làm sửa rồi gửi duyệt lại." }]} />
            )}
          </span>
        </div>
        {v.trangThaiNhan === "tu-choi" && (
          <div className="hop-thong-bao canh-bao" role="status">
            Người làm đã từ chối{v.tuChoiLuc ? ` lúc ${dinhDangNgayGio(v.tuChoiLuc)}` : ""}: “{v.lyDoTuChoi}”. Người giao: giao lại cho người khác, hoặc sửa việc rồi lưu để gửi lại.
          </div>
        )}
        <dl className="bang-thong-tin">
          <dt>Độ khó</dt>
          <dd>{v.doKho} — {NHAN_DO_KHO[v.doKho]}</dd>
          <dt>Nhận việc</dt>
          <dd>{v.trangThaiNhan ? `${NHAN_TRANG_THAI_NHAN[v.trangThaiNhan]}${v.nhanLuc ? ` (${dinhDangNgayGio(v.nhanLuc)})` : ""}` : "Không cần (tự tạo)"}</dd>
          <dt>Cần duyệt</dt>
          <dd>
            {v.canDuyet ? (
              <>
                Có —{" "}
                {ls.nguoiDuyet.map((n) => (
                  <span key={n.cap} className={`huy-hieu ${v.capDangCho === n.cap ? "canh-bao" : ""}`}>Cấp {n.cap}: {n.hoTen}</span>
                ))}
              </>
            ) : "Không"}
          </dd>
          <dt>Tiến độ</dt>
          <dd>{v.tienDo}%</dd>
          {v.hanBanDau && v.han && v.hanBanDau.getTime() !== v.han.getTime() && (
            <>
              <dt>Hạn ban đầu</dt>
              <dd>{dinhDangNgayGio(v.hanBanDau)} → hạn hiện tại {dinhDangNgayGio(v.han)}</dd>
            </>
          )}
        </dl>
      </section>

      {(ls.xemDiem && v.duyetLuc) || v.danhGia ? (
        <section className="the">
          <div className="dau">
            <h2>Đánh giá công việc</h2>
            {ls.quyen.dieuChinhDiem && (
              <FormNhanh nhanNut="Điều chỉnh điểm" tieuDe="Điều chỉnh điểm (ghi thêm, bắt buộc lý do)" url={`/api/v1/cong-viec/${v.id}/dieu-chinh-diem`} lopNut="nut nho"
                truong={[
                  { ten: "chatLuong", nhan: "Chất lượng mới", kieu: "select", luaChon: CHAT_LUONG, caDong: true },
                  { ten: "lyDo", nhan: "Lý do điều chỉnh", kieu: "textarea", batBuoc: true, caDong: true },
                ]}
                giaTriDau={{ chatLuong: String(v.chatLuong ?? 3) }} />
            )}
          </div>
          <div className="luoi-chi-so">
            <div className="the chi-so">
              <div className="nhan">Người làm tự đánh giá</div>
              <div className="gia-tri" style={{ fontSize: 16 }}>{v.danhGia ? NHAN_DANH_GIA_KET_QUA[v.danhGia] : "—"}</div>
            </div>
            {ls.xemDiem && v.duyetLuc && (
              <>
                <div className="the chi-so">
                  <div className="nhan">Người duyệt chấm chất lượng</div>
                  <div className="gia-tri">{v.chatLuong}/5</div>
                  <div className="ghi-chu">{v.chatLuong ? NHAN_CHAT_LUONG[v.chatLuong] : ""}</div>
                </div>
                <div className="the chi-so">
                  <div className="nhan">Hệ số đúng hạn</div>
                  <div className="gia-tri">{v.heSoDungHan}</div>
                  <div className="ghi-chu">Duyệt {dinhDangNgayGio(v.duyetLuc)}</div>
                </div>
                <div className="the chi-so tot">
                  <div className="nhan">Điểm việc</div>
                  <div className="gia-tri">{v.diemViec}</div>
                  <div className="ghi-chu">{v.doKho} × {v.chatLuong} × {v.heSoDungHan}{ls.dieuChinhDiem.length ? " (đã điều chỉnh)" : ""}</div>
                </div>
              </>
            )}
          </div>
          {ls.dieuChinhDiem.length > 0 && (
            <ul className="phu nho">
              {ls.dieuChinhDiem.map((d) => (
                <li key={d.id}>{dinhDangNgayGio(d.luc)} — {d.nguoi}: {d.diemCu} → {d.diemMoi} (chất lượng {d.chatLuongCu} → {d.chatLuongMoi}). Lý do: {d.lyDo}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {(ls.tienDo.length > 0 || ls.giaHan.length > 0 || ls.nhatKyDuyet.length > 0) && (
        <section className="the">
          <div className="dau"><h2>Nhật ký việc</h2></div>
          {ls.tienDo.length > 0 && (
            <>
              <h3>Tiến độ</h3>
              <ul>
                {ls.tienDo.map((t) => (
                  <li key={t.id}>
                    {dinhDangNgayGio(t.luc)} — {t.nguoi}: <strong>{t.phanTram}%</strong>{t.ghiChu ? ` · ${t.ghiChu}` : ""}
                    {t.tep.map((f) => <span key={f.id}> · <a href={`/api/v1/dinh-kem/${f.id}/tai`}>{f.ten}</a></span>)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {ls.giaHan.length > 0 && (
            <>
              <h3>Gia hạn</h3>
              <ul>
                {ls.giaHan.map((g) => (
                  <li key={g.id}>
                    {dinhDangNgayGio(g.luc)} — {g.nguoiXin} xin {g.hanCu ? dinhDangNgayGio(g.hanCu) : "—"} → {dinhDangNgayGio(g.hanMoi)}: “{g.lyDo}” ·{" "}
                    <span className={`huy-hieu ${g.trangThai === "da-duyet" ? "tot" : g.trangThai === "tu-choi" ? "loi" : "canh-bao"}`}>{NHAN_GIA_HAN[g.trangThai]}</span>
                    {g.nguoiQuyetDinh && ` (${g.nguoiQuyetDinh}${g.ghiChu ? `: ${g.ghiChu}` : ""})`}
                    {g.trangThai === "cho-duyet" && ls.quyen.quyetDinhGiaHan && (
                      <span style={{ display: "inline-flex", gap: 6, marginLeft: 8 }}>
                        <NutHanhDong url={`/api/v1/cong-viec/gia-han/${g.id}`} nhan="Đồng ý" lopNut="nut chinh nho" than={{ dongY: true, ghiChu: "" }} />
                        <FormNhanh nhanNut="Từ chối" tieuDe="Từ chối gia hạn" url={`/api/v1/cong-viec/gia-han/${g.id}`} lopNut="nut nho" themVaoThan={{ dongY: false }}
                          truong={[{ ten: "ghiChu", nhan: "Lý do", kieu: "textarea", batBuoc: true, caDong: true }]} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {ls.nhatKyDuyet.length > 0 && (
            <>
              <h3>Duyệt</h3>
              <ul>
                {ls.nhatKyDuyet.map((n) => (
                  <li key={n.id}>
                    {dinhDangNgayGio(n.luc)} — lần {n.vong}{n.cap ? `, cấp ${n.cap}` : ""}: <strong>{NHAN_HANH_DONG[n.hanhDong]}</strong> bởi {n.nguoi}
                    {n.chatLuong ? ` · chất lượng ${n.chatLuong}/5` : ""}{n.diem !== null ? ` · điểm ${n.diem}` : ""}{n.lyDo ? ` · “${n.lyDo}”` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <DanhSachKiemTra
        taskId={v.id}
        muc={du.mucKiemTra.map((m) => ({ ...m, tichLuc: m.tichLuc ? m.tichLuc.toISOString() : null }))}
        suaDuoc={du.quyen.sua && chuaXong}
        khoaVi={chuaXong ? null : v.trangThai === "xong" ? "Việc đã xong" : "Việc đã hủy"}
      />

      <KhungDinhKem loai="task" doiTuongId={v.id} moTa="Biên bản nghiệm thu, ảnh hiện trường, tệp khách gửi — bằng chứng cho kết quả công việc." />
    </>
  );
}
