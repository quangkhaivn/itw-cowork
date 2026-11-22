import { headers } from "next/headers";
import DauTrang from "@/components/ui/DauTrang";
import FormThongTinApp, { type DongApp } from "@/components/mang-xa-hoi/FormThongTinApp";
import NutSaoChep from "@/components/mang-xa-hoi/NutSaoChep";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauMotTrongCacQuyen } from "@/lib/trang";
import { danhSachThongTinApp, urlCanDan } from "@/modules/mang-xa-hoi/nen-tang-app";

export const dynamic = "force-dynamic";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Gốc URL: APP_URL, không có thì host đang mở. */
function gocUrl(host: string | null, giaoThuc: string | null): string {
  try {
    if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  } catch {
    /* rơi xuống host */
  }
  return host ? `${giaoThuc ?? "https"}://${host}` : "https://ten-mien-cowork";
}

const HUONG_DAN: Record<string, React.ReactNode> = {
  META: (
    <ol className="nho">
      <li>Vào <strong>developers.facebook.com → My Apps → Create App</strong>, chọn loại <strong>Business</strong>, gắn với Business Portfolio của công ty.</li>
      <li><strong>App settings → Basic</strong>: chép <strong>App ID</strong> và <strong>App Secret</strong> (bấm Show) vào đây. Điền <em>App Domains</em> = tên miền ở dưới; <em>Privacy Policy URL</em>, <em>Terms of Service URL</em>, <em>User data deletion</em> = các trang ở dưới.</li>
      <li>Thêm sản phẩm <strong>Facebook Login for Business</strong> → Settings → <em>Valid OAuth Redirect URIs</em>: dán <strong>Redirect URI của Meta</strong> ở dưới.</li>
      <li>Thêm quyền cần dùng (0.24): <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, <code>pages_show_list</code>, <code>instagram_business_content_publish</code>. Khách ngoài công ty dùng được sau khi Meta duyệt app (App Review) + xác minh doanh nghiệp.</li>
      <li>Bấm <strong>Kiểm tra</strong> ở đây: Cowork xin “app token” của Meta — đúng App ID / Secret thì báo đạt.</li>
    </ol>
  ),
  GOOGLE: (
    <ol className="nho">
      <li>Vào <strong>console.cloud.google.com</strong> → tạo Project → <strong>APIs &amp; Services → Library</strong>: bật <strong>YouTube Data API v3</strong> và <strong>Google Drive API</strong>.</li>
      <li><strong>OAuth consent screen</strong>: loại External, điền tên app, email hỗ trợ, <em>Authorized domains</em> = tên miền ở dưới, link Quyền riêng tư / Điều khoản.</li>
      <li><strong>Credentials → Create credentials → OAuth client ID</strong>, loại <strong>Web application</strong>; <em>Authorized redirect URIs</em>: dán <strong>Redirect URI của Google</strong> ở dưới.</li>
      <li>Chép <strong>Client ID</strong> và <strong>Client Secret</strong> vào đây. Google chỉ kiểm thật được khi nối kênh YouTube / Drive đầu tiên (0.24) — nút Kiểm tra hiện chỉ kiểm định dạng.</li>
    </ol>
  ),
  ZALO: (
    <ol className="nho">
      <li>Vào <strong>developers.zalo.me</strong> → tạo ứng dụng → liên kết Official Account đã xác thực (gói Tăng trưởng trở lên).</li>
      <li>Mục <strong>Đăng nhập / Official Account → Callback URL</strong>: dán <strong>Redirect URI của Zalo</strong> ở dưới; khai tên miền.</li>
      <li>Chép <strong>App ID</strong> và <strong>Secret Key</strong> (mục Thông tin ứng dụng) vào đây. Nút Kiểm tra hiện chỉ kiểm định dạng.</li>
    </ol>
  ),
};

/**
 * Quản trị → Kết nối nền tảng (API) (0.23.0, QĐ-199). Giám đốc / Quản trị (Cấu hình hệ thống, ĐÃ BẬT 2 LỚP) nhập thông tin app;
 * Kỹ thuật / Marketing chỉ thấy “đã cấu hình / chưa”.
 */
export default async function TrangKetNoiNenTang() {
  const nd = await yeuCauMotTrongCacQuyen(["setting.view", "mxh.view", "technical.view"]);
  const h = await headers();
  const d = await docDuLieu(nd, (tx) => danhSachThongTinApp(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const u = urlCanDan(gocUrl(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto")));
  const dong: DongApp[] = d.dong.map((x) => ({ ...x, biMatCapNhatLuc: iso(x.biMatCapNhatLuc), kiemTra: x.kiemTra && { ...x.kiemTra, luc: x.kiemTra.luc.toISOString() } }));
  return (
    <>
      <DauTrang tieuDe="Kết nối nền tảng (API)" duongDan={[{ nhan: "Quản trị" }]}
        moTa="Thông tin app Meta / Google / Zalo của công ty — nhập ngay trên màn hình, không phải sửa tệp .env. Bí mật được mã hóa (khóa SOCIAL_MASTER_KEY) và không bao giờ hiện lại; chỉ thấy 4 ký tự cuối." />

      {!d.khoaChu.coKhoa && <div className="hop-thong-bao loi" role="alert"><strong>Chưa lưu bí mật được:</strong> {d.khoaChu.loi} Máy chủ cài bằng <code>trien-khai.sh</code> hoặc bộ cài Windows sẽ tự sinh khóa khi chạy lại; xem DEPLOYMENT.md → “Nâng cấp lên 0.23.0”.</div>}
      {d.can2Lop && <div className="hop-thong-bao canh-bao">Bạn có quyền sửa nhưng chưa bật <a href="/tai-khoan#xac-thuc-2-lop">xác thực 2 lớp</a> — bật xong mới xem / nhập được thông tin app.</div>}
      {!d.quanLy && !d.can2Lop && <div className="hop-thong-bao thong-tin">Bạn chỉ xem được trạng thái. Giám đốc / Quản trị (đã bật xác thực 2 lớp) nhập thông tin app.</div>}

      <section className="the">
        <div className="dau"><h2>URL cần dán sang trang của nền tảng</h2><span className="phu nho">Lấy từ {process.env.APP_URL ? "APP_URL" : "địa chỉ bạn đang mở"}</span></div>
        <div className="than" style={{ padding: 16 }}>
          <table className="bang"><tbody>
            <tr><th>Tên miền của app (App Domains / Authorized domains)</th><td><NutSaoChep giaTri={u.tenMien} /></td></tr>
            <tr><th>Redirect URI của Meta</th><td><NutSaoChep giaTri={u.callback.META} /></td></tr>
            <tr><th>Redirect URI của Google</th><td><NutSaoChep giaTri={u.callback.GOOGLE} /></td></tr>
            <tr><th>Callback URL của Zalo</th><td><NutSaoChep giaTri={u.callback.ZALO} /></td></tr>
            <tr><th>Trang Điều khoản / Quyền riêng tư / Xóa dữ liệu</th><td className="nho">Cowork <strong>chưa có</strong> các trang này. Nền tảng bắt buộc khi gửi duyệt app — cần soạn và đăng trên website công ty (hoặc Cowork làm ở 0.24) rồi dán link vào trang của nền tảng.</td></tr>
          </tbody></table>
          <p className="phu nho">Kết nối kênh Facebook / Instagram / YouTube / Zalo bằng các URL này mở ở bản 0.24. Đường callback hiện chưa nhận yêu cầu.</p>
        </div>
      </section>

      {dong.map((x) => (
        <section className="the" key={x.nhaCungCap}>
          <div className="dau"><h2>{x.ten}</h2></div>
          <div className="than" style={{ padding: 16, display: "grid", gap: 12 }}>
            <FormThongTinApp dong={x} quanLy={d.quanLy} />
            {d.quanLy && <details><summary>Hướng dẫn từng bước</summary>{HUONG_DAN[x.nhaCungCap]}</details>}
          </div>
        </section>
      ))}

      <section className="the">
        <div className="dau"><h2>Chưa hỗ trợ</h2></div>
        <div className="than" style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {d.chuaHoTro.map((c) => <span key={c.nhaCungCap} className="huy-hieu">{c.ten}: chưa hỗ trợ</span>)}
        </div>
      </section>
    </>
  );
}
