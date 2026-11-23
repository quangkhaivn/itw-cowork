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
      <li>Vào <strong>developers.facebook.com → My Apps → Create App</strong>, chọn loại <strong>Business</strong>, gắn với Business Portfolio của công ty. App ở <strong>chế độ phát triển</strong> (Development) là đủ cho Page của chính công ty.</li>
      <li><strong>App settings → Basic</strong>: chép <strong>App ID</strong> và <strong>App Secret</strong> (bấm Show) vào đây. Điền <em>App Domains</em> = tên miền ở dưới; <em>Privacy Policy URL</em>, <em>Terms of Service URL</em> = các trang ở dưới; <em>Data deletion</em>: chọn “Data deletion callback URL” và dán <strong>Data Deletion Callback</strong> ở dưới.</li>
      <li>Thêm sản phẩm <strong>Facebook Login for Business</strong> → Settings → <em>Valid OAuth Redirect URIs</em>: dán <strong>Redirect URI của Meta</strong> ở dưới. (Tùy chọn) tạo <em>Configuration</em> với các quyền bên dưới rồi chép <strong>Configuration ID</strong> vào ô ở đây.</li>
      <li>Quyền: <code>pages_show_list</code>, <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, <code>publish_video</code>, <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>business_management</code> (khi Page thuộc Business Manager).</li>
      <li><strong>App roles → Roles</strong>: thêm tài khoản Facebook quản trị Page của công ty làm Administrator / Developer / Tester (chế độ phát triển chỉ cho người có vai trò dùng). Khách ngoài công ty dùng được sau khi Meta duyệt app (App Review) + xác minh doanh nghiệp.</li>
      <li>Bấm <strong>Kiểm tra</strong> ở đây: Cowork xin “app token” của Meta — đúng App ID / Secret thì báo đạt. Phiên bản Graph API sửa được (chưa kiểm với API thật).</li>
    </ol>
  ),
  GOOGLE: (
    <ol className="nho">
      <li>Vào <strong>console.cloud.google.com</strong> → tạo Project → <strong>APIs &amp; Services → Library</strong>: bật <strong>YouTube Data API v3</strong>, <strong>Google Drive API</strong>, <strong>Google Picker API</strong>.</li>
      <li><strong>OAuth consent screen</strong>: loại <strong>Internal</strong> nếu công ty dùng Google Workspace (không cần Google duyệt); không có Workspace thì <strong>External</strong> + thêm email người dùng vào <em>Test users</em>. Điền tên app, email hỗ trợ, <em>Authorized domains</em> = tên miền ở dưới, link Quyền riêng tư / Điều khoản.</li>
      <li><strong>Credentials → Create credentials → OAuth client ID</strong>, loại <strong>Web application</strong>; <em>Authorized JavaScript origins</em> = địa chỉ Cowork; <em>Authorized redirect URIs</em>: dán <strong>Redirect URI của Google</strong> ở dưới.</li>
      <li><strong>Credentials → Create credentials → API key</strong> → <em>Application restrictions: HTTP referrers</em> = <strong>Referrer cho API key</strong> ở dưới; <em>API restrictions</em>: chỉ Google Picker API. Dán vào ô “Google API key (Picker)”.</li>
      <li>Chép <strong>Client ID</strong> và <strong>Client Secret</strong> vào đây. Google kiểm thật khi nối kênh YouTube đầu tiên — nút Kiểm tra chỉ kiểm định dạng.</li>
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
  const d = await docDuLieu(nd, async (tx) => ({ ...(await danhSachThongTinApp(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo))), maDn: (await tx.tenant.findFirst({ where: { id: nd.phien.tenantId }, select: { code: true } }))?.code ?? "" }));
  const u = urlCanDan(gocUrl(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto")), d.maDn);
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
            <tr><th>Điều khoản sử dụng (Terms of Service URL)</th><td><NutSaoChep giaTri={u.dieuKhoan} /></td></tr>
            <tr><th>Chính sách quyền riêng tư (Privacy Policy URL)</th><td><NutSaoChep giaTri={u.quyenRiengTu} /></td></tr>
            <tr><th>Hướng dẫn xóa dữ liệu (User data deletion — trang hướng dẫn)</th><td><NutSaoChep giaTri={u.xoaDuLieu} /></td></tr>
            <tr><th>Data Deletion Callback của Meta</th><td><NutSaoChep giaTri={u.xoaDuLieuCallback} /></td></tr>
            <tr><th>Referrer cho Google API key (Picker)</th><td><NutSaoChep giaTri={u.referrerPicker} /></td></tr>
          </tbody></table>
          <p className="phu nho">Nội dung ba trang công khai sửa ở <a href="/quan-tri/trang-cong-khai">Quản trị → Trang công khai</a> (đang là bản mẫu — cần luật sư rà). Meta / Google bắt buộc Redirect URI <strong>https</strong>; Instagram tải ảnh / video từ link trên chính tên miền Cowork nên Cowork phải chạy https công khai.</p>
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
