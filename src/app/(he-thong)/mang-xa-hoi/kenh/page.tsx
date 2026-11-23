import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import NutGoi from "@/components/luong/NutGoi";
import FormKetNoiWordPress from "@/components/mang-xa-hoi/FormKetNoiWordPress";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { trangThaiKhoaChu } from "@/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { NHAN_TRANG_THAI_KENH, type TrangThaiKenh } from "@/modules/mang-xa-hoi/hang-so";
import { danhMucNenTang, danhSachKenh } from "@/modules/mang-xa-hoi/kenh";

export const dynamic = "force-dynamic";

const LOI_KET_NOI: Record<string, string> = {
  "thieu-state": "Thiếu mã chống giả mạo — bắt đầu kết nối lại.",
  "state-sai": "Mã chống giả mạo (state) không đúng — liên kết có thể bị sửa. Bắt đầu kết nối lại.",
  "state-da-dung": "Liên kết kết nối đã được dùng — bắt đầu lại.",
  "state-het-han": "Quá 10 phút kể từ lúc bấm kết nối — bắt đầu lại.",
  "sai-phien": "Lần kết nối không thuộc phiên đăng nhập này — bắt đầu lại trên chính trình duyệt này.",
  "sai-nen-tang": "Đường quay về không đúng nền tảng.",
  "redirect-khong-khop": "Đường quay về không khớp Redirect URI đã đăng ký.",
  "tu-choi": "Bạn đã không cấp quyền trên nền tảng.",
  "thieu-code": "Nền tảng không trả mã cấp quyền.",
};

/** Kênh mạng xã hội: WordPress (mật khẩu ứng dụng), Facebook / Instagram / YouTube (OAuth, 0.24.0); Zalo OA "chưa hỗ trợ" (ADR-04). */
export default async function TrangKenh({ searchParams }: { searchParams: Promise<{ "loi-ket-noi"?: string }> }) {
  const nd = await yeuCauQuyen("mxh.view");
  const loiKetNoi = (await searchParams)["loi-ket-noi"];
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { nenTang: await danhMucNenTang(nc), kenh: await danhSachKenh(nc) };
  });
  const sua = coQuyen(nd.hoSo, "mxh.update");
  const ngat = coQuyen(nd.hoSo, "mxh.delete");
  const khoa = trangThaiKhoaChu();
  return (
    <>
      <DauTrang tieuDe="Kênh" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa="Các trang / kênh / site mà Cowork đăng bài thay bạn. Mật khẩu ứng dụng và mã truy cập (token) được mã hóa trên máy chủ (khóa riêng SOCIAL_MASTER_KEY) và không bao giờ hiện lại." />

      {loiKetNoi && <div className="hop-thong-bao loi" role="alert"><strong>Chưa kết nối được:</strong> {LOI_KET_NOI[loiKetNoi] ?? loiKetNoi}</div>}

      {!khoa.coKhoa && <div className="hop-thong-bao loi" role="alert"><strong>Chưa nối kênh được:</strong> {khoa.loi} Báo quản trị máy chủ (DEPLOYMENT.md → Nâng cấp lên 0.23.0).</div>}

      <section className="the">
        <div className="dau"><h2>Nền tảng</h2></div>
        <div className="than" style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {d.nenTang.map((n) => (
            <span key={n.nenTang} className={`huy-hieu ${n.dungDuoc ? "tot" : ""}`} title={n.ghiChu ?? undefined}>{n.ten}: {n.nhanKhaDung}</span>
          ))}
        </div>
      </section>

      <section className="the">
        <div className="dau"><h2>Kênh đã nối</h2></div>
        {d.kenh.length === 0 ? <TrongRong tieuDe="Chưa nối kênh nào">Kết nối Facebook / Instagram / YouTube hoặc nối site WordPress ở dưới.</TrongRong> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Kênh</th><th>Địa chỉ</th><th>Tài khoản</th><th>Trạng thái</th><th>Kiểm tra gần nhất</th><th /></tr></thead>
            <tbody>{d.kenh.map((k) => {
              const tt = NHAN_TRANG_THAI_KENH[k.trangThai as TrangThaiKenh] ?? { nhan: k.trangThai, lop: "" };
              return (
                <tr key={k.id}>
                  <td>{k.ten}<div className="phu nho">{k.tenNenTang}</div></td>
                  <td>{k.lienKet ? <a href={k.lienKet} target="_blank" rel="noopener noreferrer">{k.oauth ? `Mở ${k.tenNenTang} ↗` : k.diaChi}</a> : k.diaChi}{k.oauth && <div className="phu nho">Mã: {k.diaChi}</div>}</td>
                  <td>{k.tenDangNhap}{k.tenHienThi && <div className="phu nho">{k.tenHienThi}</div>}</td>
                  <td><span className={`huy-hieu ${tt.lop}`}>{tt.nhan}</span></td>
                  <td className="nho">
                    {k.dangChoKiemTra ? "Đang chờ máy nền kiểm (≤ 15 giây)…" : k.kiemTraLuc ? <>{dinhDangNgayGio(k.kiemTraLuc)} — <span className={k.kiemTraDat ? "" : "loi-truong"}>{k.kiemTraThongBao}</span></> : "—"}
                  </td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {sua && <NutGoi url={`/api/v1/mang-xa-hoi/kenh/${k.id}/kiem-tra`} nhan="Kiểm tra lại" lopNut="nut nho" />}
                    {sua && k.oauth && <Link className={`nut nho${k.trangThai === "NEEDS_REAUTH" ? " chinh" : ""}`} href={`/mang-xa-hoi/kenh/ket-noi/${k.nhaCungCap === "GOOGLE" ? "google" : "meta"}?kenh=${k.id}`}>Kết nối lại</Link>}
                    {sua && !k.oauth && <FormNhanh nhanNut="Nhập lại mật khẩu" tieuDe={`Nhập lại mật khẩu ứng dụng — ${k.ten}`} url={`/api/v1/mang-xa-hoi/kenh/${k.id}/mat-khau`} lopNut={`nut nho${k.trangThai === "NEEDS_REAUTH" ? " chinh" : ""}`}
                      truong={[
                        { ten: "tenDangNhap", nhan: "Tên đăng nhập WordPress", kieu: "text", batBuoc: true },
                        { ten: "matKhauUngDung", nhan: "Mật khẩu ứng dụng mới", kieu: "password", batBuoc: true, goiY: "Tạo mới ở WordPress → Hồ sơ → Mật khẩu ứng dụng; thu hồi mật khẩu cũ ở đó." },
                      ]}
                      giaTriDau={{ tenDangNhap: k.tenDangNhap ?? "", matKhauUngDung: "" }} />}
                    {ngat && <NutGoi url={`/api/v1/mang-xa-hoi/kenh/${k.id}`} phuongThuc="DELETE" nhan="Ngắt kết nối" lopNut="nut nho" xacNhan={k.oauth
                      ? `Ngắt kênh ${k.ten}? Token đã lưu bị hủy, lượt đăng chưa chạy của kênh bị hủy. Nhớ gỡ quyền của ứng dụng trên ${k.nhaCungCap === "GOOGLE" ? "myaccount.google.com/permissions" : "Facebook (Cài đặt → Doanh nghiệp tích hợp)"}.`
                      : `Ngắt kênh ${k.ten}? Mật khẩu ứng dụng đã lưu bị hủy, lượt đăng chưa chạy của kênh bị hủy. Nhớ thu hồi mật khẩu ứng dụng trên WordPress.`} />}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>

      {sua && (
        <section className="the">
          <div className="dau"><h2>Kết nối Facebook, Instagram, YouTube</h2></div>
          <div className="than" style={{ padding: 16, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="nut chinh" href="/mang-xa-hoi/kenh/ket-noi/meta">Kết nối Facebook Page / Instagram</Link>
              <Link className="nut chinh" href="/mang-xa-hoi/kenh/ket-noi/google">Kết nối kênh YouTube</Link>
            </div>
            <p className="phu nho">Cowork mở trang đăng nhập của Facebook / Google để bạn cấp quyền, rồi cho chọn Page / tài khoản Instagram / kênh YouTube cần nối. Cần Giám đốc / Quản trị nhập thông tin app trước ở <a href="/quan-tri/ket-noi-nen-tang">Quản trị → Kết nối nền tảng (API)</a>. Chi tiết: <code>docs/HUONG-DAN-MANG-XA-HOI.md</code>.</p>
          </div>
        </section>
      )}

      {sua && (
        <section className="the">
          <div className="dau"><h2>Nối site WordPress</h2></div>
          <div className="than" style={{ padding: "16px 16px 0" }}>
            <ol className="nho" style={{ margin: 0 }}>
              <li>Trên WordPress tạo (hoặc dùng) một tài khoản vai trò <strong>Tác giả (Author)</strong> hoặc <strong>Biên tập viên (Editor)</strong> — không dùng Quản trị viên.</li>
              <li>Đăng nhập tài khoản đó → <strong>Người dùng → Hồ sơ</strong> → mục <strong>Mật khẩu ứng dụng</strong> → đặt tên “TGTH Cowork” → <strong>Thêm mật khẩu ứng dụng mới</strong> → chép chuỗi 24 ký tự (chỉ hiện một lần).</li>
              <li>Dán địa chỉ site, tên đăng nhập, mật khẩu ứng dụng vào đây → <strong>Kiểm tra kết nối</strong> → <strong>Lưu kênh</strong>.</li>
            </ol>
            <p className="phu nho">Chi tiết: <code>docs/HUONG-DAN-MANG-XA-HOI.md</code>. Site phải chạy HTTPS; plugin bảo mật chặn REST API thì cần mở cho tài khoản này.</p>
          </div>
          <FormKetNoiWordPress />
        </section>
      )}
    </>
  );
}
