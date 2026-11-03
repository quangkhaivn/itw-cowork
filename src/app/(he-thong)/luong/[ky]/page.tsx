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
import { chiTietKyLuong } from "@/modules/luong/service";

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
      {k.lyDoTraLai && tt === "nhap" && <div className="hop-thong-bao canh-bao">Bị trả lại: {k.lyDoTraLai}</div>}
      {tt === "nhap" && k.canTinhLai && k.buoc.tinh && <div className="hop-thong-bao canh-bao">Có thay đổi sau lần tính gần nhất — bấm “Tính lại” trước khi gửi duyệt.</div>}
      {k.canhBao.map((c, i) => <div key={i} className={`hop-thong-bao ${c.muc === "loi" ? "loi" : "canh-bao"}`}>{c.noiDung}</div>)}

      {k.quyen.xuat && (
        <section className="the">
          <div className="dau"><h2>Xuất file</h2></div>
          <div className="than" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="nut" href={`${url}/xuat?loai=bang-luong&dinhDang=xls`}>Bảng lương Excel{daKhoa ? "" : " (nháp)"}</a>
            <a className="nut" href={`${url}/xuat?loai=bang-luong&dinhDang=csv`}>Bảng lương CSV</a>
            {daKhoa ? (
              <>
                <a className="nut" href={`${url}/xuat?loai=ngan-hang&dinhDang=csv`}>File chi lương ngân hàng (CSV)</a>
                <a className="nut" href={`${url}/xuat?loai=ngan-hang&dinhDang=xls`}>File chi lương (Excel)</a>
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
        {k.dong.length === 0 ? <TrongRong tieuDe={k.buoc.tinh ? "Không có dòng nào trong phạm vi bạn xem được" : "Chưa tính lương"}><p>Bấm “Tính lương” sau khi bảng công tháng đã khóa và hồ sơ lương đã lập.</p></TrongRong> : (
          <div className="cuon-ngang"><table className="bang bang-luong">
            <thead><tr><th>Nhân viên</th><th className="so">Công TL</th><th className="so">Lương theo công</th><th className="so">Phụ cấp</th><th className="so">Tăng ca</th><th className="so">KPI</th><th className="so">Hoa hồng</th><th className="so">Khoản cộng</th><th className="so">Tổng thu nhập</th><th className="so">BH</th><th className="so">Thuế</th><th className="so">Khoản trừ</th><th className="so">Thực lĩnh</th><th>Cảnh báo</th></tr></thead>
            <tbody>{k.dong.map((d) => (
              <tr key={d.id}>
                <td><Link href={`/luong/phieu/${d.id}/in`}>{d.hoTen}</Link></td>
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
                { ten: "lyDo", nhan: "Lý do", kieu: "textarea", batBuoc: true, goiY: "Bắt buộc. Điều chỉnh kỳ trước: ít nhất 10 ký tự, ghi rõ sai sót gì." },
              ]}
              giaTriDau={{ nguoiId: k.dong[0]?.userId ?? "", chieu: "cong", loai: "thuong", chiuThue: true, kyGocId: "" }} />
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
