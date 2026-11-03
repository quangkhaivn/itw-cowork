import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import Can2Lop from "@/components/luong/Can2Lop";
import FormHoSoLuong from "@/components/luong/FormHoSoLuong";
import { docLuong, tien } from "@/components/luong/doc-luong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { homNayVN } from "@/modules/crm/chung";
import { danhSachHoSo, danhSachLoaiPhuCap, lichSuHoSo } from "@/modules/luong/ho-so";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PC_TRUONG = [
  { ten: "ma", nhan: "Mã (chữ thường không dấu)", kieu: "text" as const, batBuoc: true },
  { ten: "ten", nhan: "Tên", kieu: "text" as const, batBuoc: true },
  { ten: "theo", nhan: "Cách tính", kieu: "select" as const, luaChon: [{ giaTri: "thang", nhan: "Cố định tháng" }, { giaTri: "ngay-cong", nhan: "Theo ngày công thực tế" }] },
  { ten: "chiuThue", nhan: "Chịu thuế TNCN", kieu: "checkbox" as const },
  { ten: "traDu", nhan: "Trả đủ, không chia theo công (chỉ phụ cấp cố định tháng)", kieu: "checkbox" as const },
  { ten: "tinhBH", nhan: "Tính vào lương đóng bảo hiểm", kieu: "checkbox" as const },
  { ten: "thuTu", nhan: "Thứ tự", kieu: "number" as const },
  { ten: "trangThai", nhan: "Trạng thái", kieu: "select" as const, luaChon: [{ giaTri: "hoat-dong", nhan: "Đang dùng" }, { giaTri: "ngung", nhan: "Ngừng" }] },
];

/** Hồ sơ lương (LU-01 → LU-05): phiên bản theo ngày hiệu lực, phụ cấp, người phụ thuộc. Mỗi lần mở ghi nhật ký xem. */
export default async function TrangHoSoLuong({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("luong.view");
  const sp = await searchParams;
  const nguoiId = LA_UUID.test(layMot(sp.nguoi)) ? layMot(sp.nguoi) : null;
  const hn = homNayVN();
  const kq = await docLuong(() =>
    docDuLieu(nd, async (tx) => {
      const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
      const ds = await danhSachHoSo(nc, hn);
      const pc = await danhSachLoaiPhuCap(nc);
      let ls = null;
      if (nguoiId) {
        try {
          ls = await lichSuHoSo(nc, nguoiId);
        } catch (e) {
          if (!(e instanceof LoiKhongTimThay)) throw e;
        }
      }
      return { ds, pc, ls };
    }),
    nd,
  );
  if (kq.can2Lop) return <Can2Lop tieuDe="Hồ sơ lương" />;
  const { ds, pc, ls } = kq.d;
  const sua = coQuyen(nd.hoSo, "luong.update");
  const pcDung = pc.filter((p) => p.trangThai === "hoat-dong");
  // QĐ-159: không ai tự lập / sửa hồ sơ lương của chính mình — bỏ chính mình khỏi danh sách chọn (máy chủ vẫn chặn).
  const nv = ds.filter((n) => n.id !== nd.hoSo.userId).map((n) => ({ id: n.id, hoTen: n.hoTen }));
  return (
    <>
      <DauTrang
        tieuDe="Hồ sơ lương"
        duongDan={[{ nhan: "Tính lương", href: "/luong" }]}
        moTa="Mỗi thay đổi lương là một phiên bản có hiệu lực từ ngày — phiên bản cũ giữ nguyên làm lịch sử. Đổi lương / hết thử việc giữa tháng: kỳ lương chia theo ngày công của từng phiên bản (phần trước ngày hiệu lực theo mức cũ, phần sau theo mức mới). Mỗi lần mở trang này được ghi nhật ký."
        hanhDong={sua && nv.length > 0 ? <FormHoSoLuong nhanVien={nv} loaiPhuCap={pcDung} homNay={hn} /> : undefined}
      />
      {ls && (
        <section className="the">
          <div className="dau">
            <h2>{ls.nguoi.hoTen}{ls.nguoi.maNv ? ` (${ls.nguoi.maNv})` : ""} — lịch sử hồ sơ</h2>
            <span style={{ display: "flex", gap: 6 }}>
              {sua && ls.nguoi.id !== nd.hoSo.userId && <FormHoSoLuong nhanVien={nv} loaiPhuCap={pcDung} homNay={hn} nguoiId={ls.nguoi.id} dau={ls.phienBan[0] ?? null} nhanNut="Phiên bản mới" />}
              {sua && ls.nguoi.id !== nd.hoSo.userId && (
                <FormNhanh nhanNut="Thêm người phụ thuộc" tieuDe="Đăng ký người phụ thuộc" url="/api/v1/luong/nguoi-phu-thuoc" themVaoThan={{ nguoiId: ls.nguoi.id }}
                  truong={[
                    { ten: "hoTen", nhan: "Họ tên", kieu: "text", batBuoc: true },
                    { ten: "quanHe", nhan: "Quan hệ", kieu: "text", batBuoc: true },
                    { ten: "soGiayTo", nhan: "Số CCCD / mã số thuế", kieu: "text" },
                    { ten: "tuThang", nhan: "Giảm trừ từ tháng (NĂM-THÁNG)", kieu: "text", batBuoc: true, goiY: "Ví dụ 2026-01" },
                    { ten: "denThang", nhan: "Đến tháng (trống = chưa kết thúc)", kieu: "text" },
                  ]}
                  giaTriDau={{ tuThang: hn.slice(0, 7) }} />
              )}
            </span>
          </div>
          <div className="cuon-ngang"><table className="bang bang-luong">
            <thead><tr><th>Hiệu lực từ</th><th>Hợp đồng</th><th>Cách trả</th><th className="so">Lương cơ bản</th><th className="so">Lương đóng BH</th><th className="so">Thưởng KPI</th><th>Phụ cấp</th><th>Thuế</th><th>Tài khoản</th><th>Người lập</th></tr></thead>
            <tbody>{ls.phienBan.map((p) => (
              <tr key={p.id}>
                <td>{p.hieuLucTu.split("-").reverse().join("/")}</td><td>{p.nhanLoaiHopDong}{p.tyLeThuViec ? ` ${p.tyLeThuViec}%` : ""}</td><td>{p.nhanCachTra}</td>
                <td className="so">{tien(p.luongCoBan)}</td><td className="so">{tien(p.luongDongBH)}</td><td className="so">{tien(p.thuongKpi)}</td>
                <td>{p.phuCap.map((x) => `${x.ten} ${tien(x.soTien)}`).join("; ")}{p.huongHoaHong ? " · hưởng hoa hồng" : ""}</td>
                <td>{p.nhanPhuongPhapThue}{p.maSoThue ? ` · MST ${p.maSoThue}` : ""}</td><td>{p.soTaiKhoan ? `${p.soTaiKhoan} — ${p.nganHang ?? ""}` : "—"}</td><td>{p.nguoiTao}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <h3 style={{ margin: "12px 16px 4px" }}>Người phụ thuộc</h3>
          {ls.nguoiPhuThuoc.length === 0 ? <TrongRong tieuDe="Chưa đăng ký người phụ thuộc" /> : (
            <table className="bang"><tbody>{ls.nguoiPhuThuoc.map((p) => (
              <tr key={p.id}>
                <td>{p.hoTen}</td><td>{p.quanHe}</td><td>{p.soGiayTo ?? ""}</td><td>từ {p.tuThang}{p.denThang ? ` đến ${p.denThang}` : ""}</td>
                <td>{sua && !p.denThang && <FormNhanh nhanNut="Kết thúc" tieuDe="Kết thúc giảm trừ" url={`/api/v1/luong/nguoi-phu-thuoc/${p.id}`} phuongThuc="PATCH" truong={[{ ten: "denThang", nhan: "Tháng cuối còn giảm trừ (NĂM-THÁNG)", kieu: "text", batBuoc: true }]} giaTriDau={{ denThang: hn.slice(0, 7) }} />}</td>
              </tr>
            ))}</tbody></table>
          )}
        </section>
      )}
      <section className="the">
        <div className="dau"><h2>Nhân viên</h2></div>
        {ds.length === 0 ? <TrongRong tieuDe="Không có nhân viên trong phạm vi bạn xem được" /> : (
          <div className="cuon-ngang"><table className="bang bang-luong">
            <thead><tr><th>Nhân viên</th><th>Hợp đồng</th><th>Cách trả</th><th className="so">Lương cơ bản</th><th className="so">Lương đóng BH</th><th className="so">Người phụ thuộc</th><th>Tài khoản</th><th>Hiệu lực từ</th></tr></thead>
            <tbody>{ds.map((n) => (
              <tr key={n.id}>
                <td><Link href={`/luong/ho-so?nguoi=${n.id}`}>{n.hoTen}</Link>{n.maNv ? ` (${n.maNv})` : ""}</td>
                {n.hoSo ? (
                  <><td>{n.hoSo.nhanLoaiHopDong}</td><td>{n.hoSo.nhanCachTra}</td><td className="so">{tien(n.hoSo.luongCoBan)}</td><td className="so">{tien(n.hoSo.luongDongBH)}</td></>
                ) : <td colSpan={4}><span className="huy-hieu canh-bao">Chưa có hồ sơ lương</span></td>}
                <td className="so">{n.soNguoiPhuThuoc}</td><td>{n.hoSo?.soTaiKhoan ? "Có" : "—"}</td><td>{n.hoSo ? n.hoSo.hieuLucTu.split("-").reverse().join("/") : ""}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section className="the">
        <div className="dau">
          <h2>Danh mục phụ cấp</h2>
          {sua && <FormNhanh nhanNut="Thêm loại phụ cấp" tieuDe="Loại phụ cấp mới" url="/api/v1/luong/phu-cap" truong={PC_TRUONG} giaTriDau={{ theo: "thang", chiuThue: true, tinhBH: false, traDu: false, thuTu: 100, trangThai: "hoat-dong" }} />}
        </div>
        <table className="bang">
          <thead><tr><th>Mã</th><th>Tên</th><th>Cách tính</th><th>Chịu thuế</th><th>Tính BH</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{pc.map((p) => (
            <tr key={p.id}>
              <td>{p.ma}</td><td>{p.ten}</td><td>{p.theo === "ngay-cong" ? "Theo ngày công" : p.traDu ? "Cố định tháng — trả đủ" : "Cố định tháng — chia theo công"}</td><td>{p.chiuThue ? "Có" : "Không"}</td><td>{p.tinhBH ? "Có" : "Không"}</td><td>{p.trangThai === "hoat-dong" ? "Đang dùng" : "Ngừng"}</td>
              <td>{sua && <FormNhanh nhanNut="Sửa" tieuDe={`Sửa phụ cấp ${p.ten}`} url={`/api/v1/luong/phu-cap/${p.id}`} phuongThuc="PATCH" truong={PC_TRUONG} giaTriDau={{ ...p }} lopNut="nut nho" />}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="goi-y" style={{ padding: "0 16px 12px" }}>Phụ cấp cố định tháng chia theo công (số tiền × công tính lương / công chuẩn) khi vào làm / nghỉ việc giữa tháng hoặc nghỉ không lương, trừ loại đánh dấu “trả đủ”. Đổi cờ chỉ áp cho lần tính lương sau; bảng lương đã tính giữ ảnh chụp cũ.</p>
      </section>
    </>
  );
}
