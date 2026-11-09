import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import Can2Lop from "@/components/luong/Can2Lop";
import NutGoi from "@/components/luong/NutGoi";
import { docLuong, tien } from "@/components/luong/doc-luong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { LOAI_KHOAN, NHAN_LOAI_KHOAN } from "@/modules/luong/luoc-do";
import { chiTietKyLuong, NHAN_NGUON_CONG } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bảng lương chi tiết một kỳ (LU-20 → LU-45): cảnh báo, dòng lương, khoản cộng / trừ, hoa hồng, thao tác theo trạng thái. */
export default async function TrangKyLuong({ params }: { params: Promise<{ ky: string }> }) {
  const nd = await yeuCauQuyen("luong.view");
  const { ky: id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const kq = await docLuong(() =>
    docDuLieu(nd, async (tx) => {
      try {
        return await chiTietKyLuong(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
      } catch (e) {
        if (e instanceof LoiKhongTimThay) return null;
        throw e;
      }
    }),
    nd,
  );
  if (kq.can2Lop) return <Can2Lop tieuDe="Bảng lương" />;
  const k = kq.d;
  if (!k) notFound();
  const tt = k.trangThai;
  const coDuyet = coQuyen(nd.hoSo, "luong.approve");
  const url = `/api/v1/luong/ky/${k.id}`;
  const daKhoa = tt === "da-khoa" || tt === "da-chi";
  const lyDoKhongDuyet = coDuyet && !k.quyen.duyet ? (k.quyen.laNguoiTinh ? "Bạn là người tính bảng lương này nên không duyệt / khóa được." : k.quyen.coDongCuaToi ? "Bảng lương có dòng của chính bạn nên bạn không tự duyệt / khóa được." : null) : null;

  return (
    <>
      <DauTrang
        tieuDe={`Bảng lương tháng ${k.nhan}`}
        duongDan={[{ nhan: "Tính lương", href: "/luong" }]}
        moTa={<>Trạng thái: <strong>{k.nhanTrangThai}</strong>{k.buoc.tinh && <> · tính lúc {dinhDangNgayGio(k.buoc.tinh.luc)} bởi {k.buoc.tinh.nguoi}</>}{k.buoc.duyet && <> · duyệt bởi {k.buoc.duyet.nguoi}</>}{k.buoc.khoa && <> · khóa lúc {dinhDangNgayGio(k.buoc.khoa.luc)} bởi {k.buoc.khoa.nguoi}</>}{k.buoc.chi && <> · đã chi lúc {dinhDangNgayGio(k.buoc.chi.luc)}</>}</>}
        hanhDong={
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
            {tt === "nhap" && k.quyen.tinh && <NutGoi url={`${url}/tinh`} nhan={k.buoc.tinh ? "Tính lại" : "Tính lương"} lopNut="nut chinh" />}
            {tt === "nhap" && k.quyen.tinh && k.bangCong?.trangThai === "da-khoa" && k.dong.some((d) => d.nguonCong !== "bang-cong") && (
              <NutGoi url={`${url}/lay-lai-cong`} nhan="Lấy lại công từ bảng công" xacNhan="Bảng công tháng này đã khóa. Bỏ công nhập tay của những người có trong bảng công và tính lại theo bảng công?" />
            )}
            {k.quyen.nhapCong && k.dong.some((d) => d.nguonCong !== "bang-cong") && (
              <FormNhanh nhanNut="Nhập công tay" tieuDe="Nhập công tay (người chưa có bảng công khóa)" url={`${url}/cong-tay`} phuongThuc="PUT"
                truong={[
                  { ten: "nguoiId", nhan: "Nhân viên", kieu: "select", caDong: true, luaChon: k.dong.filter((d) => d.nguonCong !== "bang-cong").map((d) => ({ giaTri: d.userId, nhan: d.hoTen })) },
                  { ten: "soNgayCong", nhan: "Số ngày công (trống = đủ công chuẩn)", kieu: "number", trongLaNull: true, goiY: "Ngày đi làm thực tế, chưa gồm ngày lễ (lễ tự cộng theo lịch)." },
                  { ten: "gioTangCa", nhan: "Giờ tăng ca (ngày thường)", kieu: "number" },
                  { ten: "nghiKhongLuong", nhan: "Nghỉ không lương (ngày)", kieu: "number" },
                  { ten: "lyDo", nhan: "Lý do / căn cứ", kieu: "textarea", batBuoc: true, caDong: true, goiY: "Ví dụ: chưa có máy chấm công, theo bảng chấm công giấy của phòng." },
                ]}
                giaTriDau={{ nguoiId: k.dong.find((d) => d.nguonCong !== "bang-cong")?.userId ?? "", soNgayCong: null, gioTangCa: 0, nghiKhongLuong: 0, lyDo: "" }} />
            )}
            {tt === "nhap" && k.quyen.tinh && k.buoc.tinh && <NutGoi url={`${url}/gui-duyet`} nhan="Gửi duyệt" xacNhan="Gửi bảng lương cho Giám đốc duyệt? Sau khi gửi không sửa được cho tới khi bị trả lại." />}
            {tt === "cho-duyet" && k.quyen.duyet && <NutGoi url={`${url}/duyet`} nhan="Duyệt" lopNut="nut chinh" />}
            {tt === "da-duyet" && k.quyen.duyet && <NutGoi url={`${url}/khoa`} nhan="Khóa bảng lương" lopNut="nut chinh" xacNhan="Khóa bảng lương? Sau khi khóa KHÔNG sửa được nữa; nhân viên xem được phiếu lương của mình." />}
            {(tt === "cho-duyet" || tt === "da-duyet") && coDuyet && (
              <FormNhanh nhanNut="Trả lại" tieuDe="Trả lại bảng lương cho kế toán" url={`${url}/tra-lai`} truong={[{ ten: "lyDo", nhan: "Lý do", kieu: "textarea", batBuoc: true }]} />
            )}
            {tt === "da-khoa" && k.quyen.xuat && <NutGoi url={`${url}/da-chi`} nhan="Đánh dấu đã chi" xacNhan="Xác nhận đã chuyển lương cho nhân viên?" />}
            {daKhoa && k.quyen.xuat && <NutGoi url={`${url}/gui-email`} nhan="Gửi email phiếu lương" xacNhan="Xếp thư phiếu lương cho mọi người trong bảng? Mỗi người chỉ nhận một lần." />}
          </span>
        }
      />
      {lyDoKhongDuyet && <div className="hop-thong-bao thong-tin">{lyDoKhongDuyet}</div>}
      {!k.conNguoiDuyet && (tt === "nhap" || tt === "cho-duyet" || tt === "da-duyet") && k.dong.length > 0 && (
        <div className="hop-thong-bao loi" role="alert">
          Không còn ai duyệt được bảng lương này (mọi người có quyền duyệt hoặc là người tính, hoặc có dòng trong bảng). Tách dòng của lãnh đạo sang một kỳ lương riêng: Tính lương → <strong>Tạo kỳ lương riêng</strong>, rồi tính lại kỳ này. Kỳ riêng do Quản trị hoặc Giám đốc khác duyệt.
        </div>
      )}
      {k.dong.some((d) => d.taiKhoanDoiLuc) && (
        <div className="hop-thong-bao canh-bao" role="alert">
          <strong>Tài khoản nhận lương vừa đổi trong 30 ngày:</strong> {k.dong.filter((d) => d.taiKhoanDoiLuc).map((d) => `${d.hoTen} (${dinhDangNgayGio(d.taiKhoanDoiLuc)})`).join("; ")}. Gọi xác nhận trực tiếp với nhân viên trước khi duyệt / chi.
        </div>
      )}
      {k.lyDoTraLai && tt === "nhap" && <div className="hop-thong-bao canh-bao">Bị trả lại: {k.lyDoTraLai}</div>}
      {tt === "nhap" && k.canTinhLai && k.buoc.tinh && <div className="hop-thong-bao canh-bao">Có thay đổi sau lần tính gần nhất — bấm “Tính lại” trước khi gửi duyệt.</div>}
      {k.canhBao.map((c, i) => <div key={i} className={`hop-thong-bao ${c.muc === "loi" ? "loi" : "canh-bao"}`} role={c.ma === "tham-so-chua-xac-nhan" ? "alert" : undefined}>{c.ma === "tham-so-chua-xac-nhan" && <strong>Tham số lương chưa xác nhận. </strong>}{c.noiDung}{c.ma === "tham-so-chua-xac-nhan" && <> <Link href="/luong/tham-so">Xác nhận ở Tham số lương</Link>.</>}</div>)}
      {k.chuaCoHoSo.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Chưa có hồ sơ lương ({k.chuaCoHoSo.length})</h2><span className="phu nho">Không bắt buộc — phần mềm vẫn tính lương cho người đã có hồ sơ</span></div>
          <div className="than" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {k.chuaCoHoSo.map((u) => <Link key={u.id} className="nut nho" href={`/luong/ho-so?nguoi=${u.id}`}>Tạo hồ sơ: {u.hoTen}</Link>)}
          </div>
        </section>
      )}

      {k.quyen.xuat && (
        <section className="the">
          <div className="dau"><h2>Xuất file</h2></div>
          <div className="than" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="nut" href={`${url}/xuat?loai=bang-luong&dinhDang=xls`}>Bảng lương Excel{daKhoa ? "" : " (nháp)"}</a>
            <a className="nut" href={`${url}/xuat?loai=bang-luong&dinhDang=csv`}>Bảng lương CSV</a>
            {daKhoa ? (
              <>
                <a className="nut chinh" href={`${url}/xuat?loai=ngan-hang&dinhDang=xls`}>File chi lương ngân hàng (Excel)</a>
                <a className="nut" href={`${url}/xuat?loai=ngan-hang&dinhDang=csv`} title="Mở CSV bằng Excel có thể làm mất số 0 đầu số tài khoản — nên dùng bản Excel">File chi lương (CSV)</a>
                <a className="nut" href={`${url}/xuat?loai=but-toan`}>Bút toán lương (CSV)</a>
              </>
            ) : <span className="goi-y">File chi lương ngân hàng và bút toán chỉ xuất được khi kỳ đã khóa.</span>}
          </div>
        </section>
      )}

      <section className="the">
        <div className="dau"><h2>Tổng hợp</h2></div>
        <div className="cuon-ngang"><table className="bang bang-luong">
          <thead><tr><th className="so">Số người</th><th className="so">Tổng thu nhập</th><th className="so">BH người lao động</th><th className="so">Thuế TNCN</th><th className="so">Khoản trừ</th><th className="so">Thực lĩnh</th><th className="so">BH + KPCĐ doanh nghiệp</th><th className="so">Chi phí doanh nghiệp</th></tr></thead>
          <tbody><tr>
            <td className="so">{k.tong.soNguoi}</td><td className="so">{tien(k.tong.tongThuNhap)}</td><td className="so">{tien(k.tong.bhNld)}</td><td className="so">{tien(k.tong.thue)}</td>
            <td className="so">{tien(k.tong.khoanTru)}</td><td className="so"><strong>{tien(k.tong.thucLinh)}</strong></td><td className="so">{tien(k.tong.bhDn)}</td><td className="so">{tien(k.tong.chiPhiDn)}</td>
          </tr></tbody>
        </table></div>
      </section>

      <section className="the">
        <div className="dau"><h2>Dòng lương</h2></div>
        {k.dong.length === 0 ? <TrongRong tieuDe={k.buoc.tinh ? "Không có dòng nào trong phạm vi bạn xem được" : "Chưa tính lương"}><p>Bấm “Tính lương”. Chưa có bảng công khóa thì công lấy từ công nhập tay hoặc tạm tính đủ công chuẩn (có cảnh báo).</p></TrongRong> : (
          <div className="cuon-ngang"><table className="bang bang-luong">
            <thead><tr><th>Nhân viên</th><th className="so">Công TL</th><th className="so">Lương theo công</th><th className="so">Phụ cấp</th><th className="so">Tăng ca</th><th className="so">KPI</th><th className="so">Hoa hồng</th><th className="so">Khoản cộng</th><th className="so">Tổng thu nhập</th><th className="so">BH</th><th className="so">Thuế</th><th className="so">Khoản trừ</th><th className="so">Thực lĩnh</th><th>Cảnh báo</th></tr></thead>
            <tbody>{k.dong.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/luong/phieu/${d.id}/in`}>{d.hoTen}</Link>
                  <div className="goi-y">Công: {NHAN_NGUON_CONG[d.nguonCong]}{d.traTay && " · trả tay"}</div>
                  {d.taiKhoanDoiLuc && <span className="huy-hieu canh-bao" title="Tài khoản nhận lương đổi trong 30 ngày"> TK mới đổi</span>}
                  {d.taiKhoanChup && <div className="goi-y">TK chụp lúc khóa: …{d.taiKhoanChup.soDuoi ?? "—"}{d.taiKhoanChup.nganHang ? ` · ${d.taiKhoanChup.nganHang}` : ""}</div>}
                  {daKhoa && k.quyen.xuat && <NutGoi url={`/api/v1/luong/dong/${d.id}/gui-lai`} nhan="Gửi lại phiếu" lopNut="nut nho" xacNhan={`Gửi lại thư phiếu lương cho ${d.hoTen}?`} />}
                </td>
                <td className="so">{d.congTinhLuong}</td><td className="so">{tien(d.luongTheoCong)}</td><td className="so">{tien(d.phuCap)}</td><td className="so">{tien(d.tangCa)}</td>
                <td className="so">{tien(d.thuongKpi)}</td><td className="so">{tien(d.hoaHong)}</td><td className="so">{tien(d.khoanCong)}</td><td className="so">{tien(d.tongThuNhap)}</td>
                <td className="so">{tien(d.bhNld)}</td><td className="so">{tien(d.thue)}</td><td className="so">{tien(d.khoanTru)}</td><td className="so"><strong>{tien(d.thucLinh)}</strong></td>
                <td>{d.canhBao.map((c, i) => <span key={i} className={`huy-hieu ${c.muc === "loi" ? "loi" : "canh-bao"}`} title={c.noiDung}>{c.noiDung}</span>)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="the">
        <div className="dau">
          <h2>Khoản cộng / trừ, điều chỉnh kỳ trước</h2>
          {tt === "nhap" && k.quyen.tinh && k.dong.length > 0 && (
            <FormNhanh nhanNut="Thêm khoản" tieuDe="Thêm khoản cộng / trừ" url={`${url}/khoan`} lopNut="nut chinh"
              truong={[
                { ten: "nguoiId", nhan: "Nhân viên", kieu: "select", luaChon: k.dong.map((d) => ({ giaTri: d.userId, nhan: d.hoTen })) },
                { ten: "chieu", nhan: "Cộng / trừ", kieu: "select", luaChon: [{ giaTri: "cong", nhan: "Cộng vào lương" }, { giaTri: "tru", nhan: "Trừ khỏi lương" }] },
                { ten: "loai", nhan: "Loại", kieu: "select", luaChon: LOAI_KHOAN.map((l) => ({ giaTri: l, nhan: NHAN_LOAI_KHOAN[l] })) },
                { ten: "soTien", nhan: "Số tiền (đ)", kieu: "text", batBuoc: true },
                { ten: "chiuThue", nhan: "Khoản cộng chịu thuế TNCN", kieu: "checkbox" },
                { ten: "kyGocId", nhan: "Kỳ được điều chỉnh (chỉ với loại Điều chỉnh)", kieu: "select", luaChon: [{ giaTri: "", nhan: "—" }, ...k.kyDaKhoa.map((x) => ({ giaTri: x.id, nhan: x.nhan }))] },
                { ten: "cachTinh", nhan: "Điều chỉnh tính (bắt buộc với loại Điều chỉnh)", kieu: "select", luaChon: [
                  { giaTri: "", nhan: "—" },
                  { giaTri: "truoc-thue", nhan: "Trước thuế — lương / phụ cấp / thưởng trả thừa hoặc thiếu (vào thu nhập chịu thuế)" },
                  { giaTri: "sau-thue", nhan: "Sau thuế — tạm ứng, khoản đã trừ sau thuế" },
                ] },
                { ten: "tinhBH", nhan: "Điều chỉnh trước thuế: tính vào lương đóng bảo hiểm", kieu: "checkbox" },
                { ten: "lyDo", nhan: "Lý do", kieu: "textarea", batBuoc: true, goiY: "Bắt buộc. Điều chỉnh kỳ trước: ít nhất 10 ký tự, ghi rõ sai sót gì." },
              ]}
              giaTriDau={{ nguoiId: k.dong[0]?.userId ?? "", chieu: "cong", loai: "thuong", chiuThue: true, kyGocId: "", cachTinh: "", tinhBH: false }} />
          )}
        </div>
        {k.khoan.length === 0 ? <TrongRong tieuDe="Không có khoản nhập tay" /> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Nhân viên</th><th>Loại</th><th className="so">Số tiền</th><th>Lý do</th><th>Kỳ gốc</th><th>Người nhập</th><th>Người duyệt</th><th /></tr></thead>
            <tbody>{k.khoan.map((x) => (
              <tr key={x.id}>
                <td>{x.hoTen}</td><td>{x.nhanLoai}{x.chieu === "cong" && !x.chiuThue ? " (không chịu thuế)" : ""}</td>
                <td className="so">{x.chieu === "tru" ? "−" : "+"}{tien(x.soTien)}</td><td>{x.lyDo}</td><td>{x.kyGoc ?? ""}</td><td>{x.nguoiNhap}</td><td>{x.nguoiDuyet ?? "—"}</td>
                <td>{tt === "nhap" && k.quyen.tinh && <NutGoi url={`/api/v1/luong/khoan/${x.id}`} phuongThuc="DELETE" nhan="Xóa" lopNut="nut nho" xacNhan="Xóa khoản này?" />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      {k.congTay.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Công nhập tay</h2></div>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Nhân viên</th><th className="so">Số ngày công</th><th className="so">Giờ tăng ca</th><th className="so">Nghỉ không lương</th><th>Lý do</th><th>Người nhập</th><th /></tr></thead>
            <tbody>{k.congTay.map((c) => (
              <tr key={c.nguoiId}>
                <td>{c.hoTen}</td><td className="so">{c.soNgayCong ?? "đủ công chuẩn"}</td><td className="so">{c.gioTangCa}</td><td className="so">{c.nghiKhongLuong}</td><td>{c.lyDo}</td>
                <td>{c.nguoiNhap} · {dinhDangNgayGio(c.luc)}</td>
                <td>{k.quyen.nhapCong && <NutGoi url={`${url}/cong-tay?nguoiId=${c.nguoiId}`} phuongThuc="DELETE" nhan="Bỏ" lopNut="nut nho" xacNhan={`Bỏ công nhập tay của ${c.hoTen}?`} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {k.traTay.soNguoi > 0 && (
        <section className="the">
          <div className="dau"><h2>Trả tay / tiền mặt ({k.traTay.soNguoi} người · {tien(k.traTay.tong)} đ)</h2>
            {k.traTay.daKhoa && k.quyen.xuat && <a className="nut nho" href={`${url}/xuat?loai=tra-tay&dinhDang=xls`}>Danh sách trả tay (Excel)</a>}
          </div>
          <p className="phu nho" style={{ marginTop: 0 }}>Người chưa có số tài khoản hoặc hồ sơ chọn “Tiền mặt / trả tay”: không vào file chi lương ngân hàng, không chặn khóa kỳ. {k.traTay.daKhoa ? "Hình thức trả đã chụp lúc khóa." : "Dự kiến theo hồ sơ hiện hành — chốt lúc khóa kỳ."}</p>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Nhân viên</th><th className="so">Thực lĩnh</th></tr></thead>
            <tbody>
              {k.traTay.ds.map((d) => <tr key={d.userId}><td>{d.hoTen}</td><td className="so">{tien(d.thucLinh)}</td></tr>)}
              <tr><td><strong>Tổng</strong></td><td className="so"><strong>{tien(k.traTay.tong)}</strong></td></tr>
            </tbody>
          </table></div>
        </section>
      )}

      {k.hoaHong.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Hoa hồng theo phiếu thu</h2></div>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Nhân viên</th><th>Phiếu thu</th><th>Ngày thu</th><th className="so">Tiền thu</th><th className="so">Tỷ lệ</th><th className="so">Hoa hồng</th></tr></thead>
            <tbody>{k.hoaHong.map((h) => (
              <tr key={h.id}>
                <td>{k.dong.find((d) => d.userId === h.userId)?.hoTen ?? "—"}</td><td>{h.soPhieu}{h.loai === "truy-thu" && <span className="huy-hieu loi"> truy thu</span>}</td>
                <td>{h.ngayThu.split("-").reverse().join("/")}</td><td className="so">{tien(h.soTien)}</td><td className="so">{h.tyLe}%</td><td className="so">{tien(h.hoaHong)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
