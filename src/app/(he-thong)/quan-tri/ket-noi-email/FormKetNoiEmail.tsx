"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import type { GoiYKetNoi } from "@/modules/email/tinh-toan";
import type { HanMucHomNay } from "@/modules/email/han-muc";

interface KetNoi {
  daCauHinh: boolean;
  host: string;
  port: number;
  baoMat: "tls" | "starttls" | "none";
  tenDangNhap: string;
  coMatKhau: boolean;
  tenNguoiGui: string;
  emailNguoiGui: string;
  traLoi: string;
  theoDoi: boolean;
  lanThuCuoi: { luc: string; ok: boolean; loi: string | null } | null;
  capNhatLuc: string | null;
  kenh: "smtp" | "ses";
  sesVung: string;
  sesConfigurationSet: string;
  tenMienGui: string;
  tenMienMailFrom: string;
  dkim: string[];
  dmarcRua: string;
  sesTopicArn: string;
  nhanQuangCao: string;
  webhook: { coMa: boolean; goiY: string | null; doiLuc: string | null; dangKyLuc: string | null; suKienCuoiLuc: string | null };
}

/**
 * Form kết nối SMTP. Ô mật khẩu luôn trống: máy chủ không trả mật khẩu về (EM-02). Bỏ trống khi
 * lưu = giữ nguyên mật khẩu cũ; muốn gỡ thì tích "Xóa mật khẩu đang lưu".
 */
export default function FormKetNoiEmail({
  ketNoi,
  coKhoaMaHoa,
  goiY,
  duocSua,
  emailCuaToi,
  hanMuc,
}: {
  ketNoi: KetNoi;
  coKhoaMaHoa: boolean;
  goiY: GoiYKetNoi[];
  duocSua: boolean;
  emailCuaToi: string;
  hanMuc: HanMucHomNay;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const thu = useGoiApi();
  const [f, datF] = useState({
    host: ketNoi.host,
    port: String(ketNoi.port),
    baoMat: ketNoi.baoMat,
    tenDangNhap: ketNoi.tenDangNhap,
    matKhau: "",
    xoaMatKhau: false,
    tenNguoiGui: ketNoi.tenNguoiGui,
    emailNguoiGui: ketNoi.emailNguoiGui,
    traLoi: ketNoi.traLoi,
    theoDoi: ketNoi.theoDoi,
    kenh: ketNoi.kenh,
    sesVung: ketNoi.sesVung,
    sesConfigurationSet: ketNoi.sesConfigurationSet,
    tenMienGui: ketNoi.tenMienGui,
    tenMienMailFrom: ketNoi.tenMienMailFrom,
    dkim: ketNoi.dkim.join("\n"),
    dmarcRua: ketNoi.dmarcRua,
    sesTopicArn: ketNoi.sesTopicArn,
    nhanQuangCao: ketNoi.nhanQuangCao,
  });
  const wh = useGoiApi();
  const [urlWebhook, datUrlWebhook] = useState<string | null>(null);
  const laSes = f.kenh === "ses";
  const [daLuu, datDaLuu] = useState(false);
  const [kqThu, datKqThu] = useState<{ ok: boolean; loi: string | null; den: string } | null>(null);
  const [huongDan, datHuongDan] = useState<string | null>(null);
  const doi = (k: keyof typeof f, v: string | boolean) => {
    datDaLuu(false);
    datF((c) => ({ ...c, [k]: v }));
  };

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi("/api/v1/email/ket-noi", "PUT", {
      ...f,
      port: Number(f.port),
      matKhau: f.matKhau || undefined,
      dkim: f.dkim.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean),
    });
    if (kq) {
      datDaLuu(true);
      datF((c) => ({ ...c, matKhau: "", xoaMatKhau: false }));
      router.refresh();
    }
  }

  async function guiThu() {
    datKqThu(null);
    const kq = await thu.goi<{ ok: boolean; loi: string | null; den: string }>("/api/v1/email/ket-noi/gui-thu", "POST");
    if (kq) {
      datKqThu(kq);
      router.refresh();
    }
  }

  async function doiMaWebhook() {
    if (ketNoi.webhook.coMa && !window.confirm("Đổi mã webhook? URL cũ hết hiệu lực ngay — phải sửa lại đăng ký HTTPS trong SNS.")) return;
    const kq = await wh.goi<{ url: string }>("/api/v1/email/ket-noi/ses-webhook", "POST");
    if (kq) {
      datUrlWebhook(kq.url);
      router.refresh();
    }
  }

  function apGoiY(g: GoiYKetNoi) {
    datF((c) => ({ ...c, host: g.host, port: String(g.port), baoMat: g.baoMat }));
    datHuongDan(g.huongDan);
  }

  return (
    <div className="luoi-ben-phai">
      <form className="the" onSubmit={luu}>
        {!coKhoaMaHoa && (
          <div className="hop-thong-bao canh-bao" role="status" style={{ margin: 16 }}>
            Máy chủ chưa đặt khóa mã hóa <code>APP_ENC_KEY</code> — chưa lưu được mật khẩu SMTP. Báo quản trị máy chủ đặt biến này (xem DEPLOYMENT.md).
          </div>
        )}
        {loi && (
          <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
            {loi.thongBao}
          </div>
        )}
        {daLuu && (
          <div className="hop-thong-bao tot" role="status" style={{ margin: 16 }}>
            Đã lưu kết nối.
          </div>
        )}
        <div className="phan-form">
          <h3>Kênh gửi</h3>
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="kn-kenh">Gửi qua</label>
              <select id="kn-kenh" value={f.kenh} disabled={!duocSua} onChange={(e) => doi("kenh", e.target.value)}>
                <option value="smtp">Hộp thư SMTP (Gmail, Microsoft 365, máy chủ riêng…)</option>
                <option value="ses">Amazon SES (gửi số lượng lớn)</option>
              </select>
              <span className="goi-y">
                {laSes
                  ? "Máy tự dùng email-smtp.<vùng>.amazonaws.com cổng 587 STARTTLS. Tên đăng nhập / mật khẩu là SMTP credentials tạo trong SES (khác khóa IAM). Xem docs/HUONG-DAN-SES.md."
                  : "Chưa có tài khoản AWS vẫn dùng được mọi tính năng (sổ đồng ý, nhãn quảng cáo, 3 thư/24 giờ, khởi động, báo cáo) với hộp thư SMTP hiện tại."}
              </span>
            </div>
            <div className="truong">
              <label htmlFor="kn-qc">Nhãn quảng cáo đầu tiêu đề</label>
              <input id="kn-qc" type="text" maxLength={20} value={f.nhanQuangCao} disabled={!duocSua} onChange={(e) => doi("nhanQuangCao", e.target.value)} placeholder="[QC]" />
              <span className="goi-y">NĐ 91/2020 Điều 18: thư quảng cáo phải có nhãn ở đầu tiêu đề. Máy tự gắn, người soạn không bỏ được; để trống = [QC].</span>
            </div>
            {laSes && (
              <>
                <div className="truong">
                  <label htmlFor="kn-vung">Vùng SES</label>
                  <input id="kn-vung" type="text" value={f.sesVung} disabled={!duocSua} onChange={(e) => doi("sesVung", e.target.value)} placeholder="ap-southeast-1" />
                  <span className="goi-y">ap-southeast-1 = Singapore (gần Việt Nam nhất).</span>
                </div>
                <div className="truong">
                  <label htmlFor="kn-cs">Configuration set</label>
                  <input id="kn-cs" type="text" value={f.sesConfigurationSet} disabled={!duocSua} onChange={(e) => doi("sesConfigurationSet", e.target.value)} placeholder="cowork-tin" />
                  <span className="goi-y">Để SES đẩy sự kiện (tới hộp thư, trả lại, báo rác) về webhook bên dưới.</span>
                </div>
                <div className="truong ca-dong">
                  <label htmlFor="kn-topic">ARN chủ đề SNS nhận sự kiện</label>
                  <input id="kn-topic" type="text" value={f.sesTopicArn} disabled={!duocSua} onChange={(e) => doi("sesTopicArn", e.target.value)} placeholder="arn:aws:sns:ap-southeast-1:123456789012:cowork-ses-su-kien" />
                  <span className="goi-y">Webhook chỉ nhận thông điệp của đúng chủ đề này (đã kiểm chữ ký của Amazon SNS).</span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="phan-form">
          <h3>Tên miền gửi</h3>
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="kn-tm">Tên miền gửi thư marketing</label>
              <input id="kn-tm" type="text" value={f.tenMienGui} disabled={!duocSua} onChange={(e) => doi("tenMienGui", e.target.value)} placeholder="tin.itwonline.com" />
              <span className="goi-y">Nên dùng tên miền con riêng cho thư marketing để uy tín của tên miền chính không bị ảnh hưởng. Kênh SES: địa chỉ gửi phải thuộc tên miền này.</span>
            </div>
            <div className="truong">
              <label htmlFor="kn-mf">Tên miền MAIL FROM</label>
              <input id="kn-mf" type="text" value={f.tenMienMailFrom} disabled={!duocSua} onChange={(e) => doi("tenMienMailFrom", e.target.value)} placeholder={f.tenMienGui ? `bounce.${f.tenMienGui}` : "bounce.tin.itwonline.com"} />
              <span className="goi-y">Để trống = bounce.&lt;tên miền gửi&gt;.</span>
            </div>
            <div className="truong">
              <label htmlFor="kn-rua">Hộp thư nhận báo cáo DMARC</label>
              <input id="kn-rua" type="email" value={f.dmarcRua} disabled={!duocSua} onChange={(e) => doi("dmarcRua", e.target.value)} placeholder="dmarc@itwonline.com" />
            </div>
            <div className="truong">
              <label htmlFor="kn-dkim">3 mã DKIM từ SES (mỗi mã một dòng)</label>
              <textarea id="kn-dkim" rows={3} value={f.dkim} disabled={!duocSua} onChange={(e) => doi("dkim", e.target.value)} placeholder="Dán sau khi xác minh tên miền trong Amazon SES" />
            </div>
          </div>
        </div>
        <div className="phan-form">
          <h3>Máy chủ gửi thư (SMTP)</h3>
          {duocSua && !laSes && (
            <div className="chuoi-lua-chon" style={{ marginBottom: 12, gap: 8 }}>
              {goiY.map((g) => (
                <button key={g.ten} type="button" className="nut trong nho" onClick={() => apGoiY(g)}>
                  {g.ten}
                </button>
              ))}
            </div>
          )}
          {huongDan && (
            <div className="hop-thong-bao" role="note" style={{ marginBottom: 12 }}>
              {huongDan}
            </div>
          )}
          <div className="luoi-form">
            {!laSes && (
              <>
            <div className="truong">
              <label htmlFor="kn-host">Máy chủ</label>
              <input type="text" id="kn-host" value={f.host} disabled={!duocSua} onChange={(e) => doi("host", e.target.value)} placeholder="smtp.gmail.com" required />
              {loiCua(loi, "host") && <span className="chu-loi">{loiCua(loi, "host")}</span>}
            </div>
            <div className="truong">
              <label htmlFor="kn-port">Cổng</label>
              <input type="text" id="kn-port" inputMode="numeric" value={f.port} disabled={!duocSua} onChange={(e) => doi("port", e.target.value)} required />
            </div>
            <div className="truong">
              <label htmlFor="kn-bm">Mã hóa kết nối</label>
              <select id="kn-bm" value={f.baoMat} disabled={!duocSua} onChange={(e) => doi("baoMat", e.target.value)}>
                <option value="tls">TLS ngay từ đầu (thường cổng 465)</option>
                <option value="starttls">STARTTLS (thường cổng 587)</option>
                <option value="none">Không mã hóa — chỉ máy chủ nội bộ, không đăng nhập</option>
              </select>
            </div>
              </>
            )}
            {laSes && (
              <div className="truong ca-dong">
                <span className="goi-y">
                  Máy chủ: <code>email-smtp.{f.sesVung || "ap-southeast-1"}.amazonaws.com</code> · cổng 587 · STARTTLS (máy tự đặt).
                </span>
              </div>
            )}
            <div className="truong">
              <label htmlFor="kn-user">Tên đăng nhập</label>
              <input type="text" id="kn-user" autoComplete="off" value={f.tenDangNhap} disabled={!duocSua} onChange={(e) => doi("tenDangNhap", e.target.value)} />
            </div>
            <div className="truong">
              <label htmlFor="kn-mk">Mật khẩu / mật khẩu ứng dụng</label>
              <input
                id="kn-mk"
                type="password"
                autoComplete="new-password"
                value={f.matKhau}
                disabled={!duocSua || f.xoaMatKhau}
                onChange={(e) => doi("matKhau", e.target.value)}
                placeholder={ketNoi.coMatKhau ? "•••••• (đã lưu — bỏ trống để giữ nguyên)" : "Chưa có mật khẩu"}
              />
              {ketNoi.coMatKhau && duocSua && (
                <label className="nho" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <input type="checkbox" checked={f.xoaMatKhau} onChange={(e) => doi("xoaMatKhau", e.target.checked)} /> Xóa mật khẩu đang lưu
                </label>
              )}
            </div>
          </div>
        </div>
        <div className="phan-form">
          <h3>Người gửi</h3>
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="kn-ten">Tên người gửi</label>
              <input type="text" id="kn-ten" value={f.tenNguoiGui} disabled={!duocSua} onChange={(e) => doi("tenNguoiGui", e.target.value)} placeholder="Thế Giới Tin Học" required />
              {loiCua(loi, "tenNguoiGui") && <span className="chu-loi">{loiCua(loi, "tenNguoiGui")}</span>}
            </div>
            <div className="truong">
              <label htmlFor="kn-email">Địa chỉ gửi</label>
              <input id="kn-email" type="email" value={f.emailNguoiGui} disabled={!duocSua} onChange={(e) => doi("emailNguoiGui", e.target.value)} required />
              <span className="goi-y">
                {laSes
                  ? `Phải thuộc tên miền gửi, vd tin@${f.tenMienGui || "tin.itwonline.com"}.`
                  : "Gmail / Microsoft 365 chỉ cho gửi bằng đúng địa chỉ của tài khoản đăng nhập (hoặc bí danh đã xác minh)."}
              </span>
            </div>
            <div className="truong">
              <label htmlFor="kn-tl">Địa chỉ nhận thư trả lời</label>
              <input id="kn-tl" type="email" value={f.traLoi} disabled={!duocSua} onChange={(e) => doi("traLoi", e.target.value)} placeholder="Để trống = trả lời về địa chỉ gửi" />
            </div>
            <div className="truong ca-dong">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={f.theoDoi} disabled={!duocSua} onChange={(e) => doi("theoDoi", e.target.checked)} />
                Theo dõi lượt mở và lượt bấm liên kết
              </label>
              <span className="goi-y">
                Bật thì thư có một điểm ảnh 1×1 và liên kết đi qua máy chủ để đếm. Áp cho chiến dịch được duyệt sau khi bật; chiến dịch đã duyệt giữ nguyên.
              </span>
            </div>
          </div>
        </div>
        {duocSua && (
          <div className="chan-form">
            <span className="goi-y" style={{ marginRight: "auto" }}>
              {ketNoi.capNhatLuc ? `Cập nhật ${dinhDangNgayGio(ketNoi.capNhatLuc)}` : "Chưa cấu hình"}
            </span>
            <button type="submit" className="nut chinh" disabled={dangGui}>
              {dangGui ? "Đang lưu…" : "Lưu kết nối"}
            </button>
          </div>
        )}
      </form>

      <div>
      <section className="the">
        <div className="dau">
          <h2>Hạn mức gửi hôm nay</h2>
        </div>
        <div className="than nho">
          <p>
            Tốc độ: <strong>{dinhDangSo(hanMuc.moiPhut)} thư/phút</strong>
            {hanMuc.moiPhutMacDinh && <span className="huy-hieu">mặc định</span>}
          </p>
          <p>
            Trần ngày:{" "}
            <strong>{hanMuc.tranHomNay === null ? "không chặn" : `${dinhDangSo(hanMuc.tranHomNay)} thư`}</strong>
            {hanMuc.tranHomNay !== null && ` — đã gửi ${dinhDangSo(hanMuc.daGuiHomNay)}, còn ${dinhDangSo(hanMuc.conLaiHomNay)}`}
          </p>
          <p>
            Trần đã đặt: {hanMuc.tranNgayDat === null ? "chưa đặt" : `${dinhDangSo(hanMuc.tranNgayDat)} thư/ngày`}
            {hanMuc.tranNgayMacDinhSes && <span className="huy-hieu">mặc định khi dùng SES</span>}
          </p>
          <p>
            Khởi động:{" "}
            {hanMuc.khoiDong
              ? `ngày thứ ${hanMuc.khoiDong.ngayThu} — trần ${dinhDangSo(hanMuc.khoiDong.tranHomNay)} thư (từ ${dinhDangSo(hanMuc.khoiDong.mucDau)} × ${dinhDangSo(hanMuc.khoiDong.heSo)}^ngày)`
              : "chưa đặt ngày bắt đầu — không áp đường khởi động"}
          </p>
          <p>Mỗi địa chỉ tối đa {hanMuc.toiDaMoiDiaChi24h} thư quảng cáo / 24 giờ (mọi chiến dịch).</p>
          <p className="phu">Đổi ở Quản trị → Cấu hình → Email marketing.</p>
        </div>
      </section>

      {ketNoi.kenh === "ses" && (
        <section className="the">
          <div className="dau">
            <h2>Webhook sự kiện SES</h2>
          </div>
          <div className="than nho">
            <p>
              Trạng thái: {ketNoi.webhook.coMa ? <span className="huy-hieu tot">Đã có mã {ketNoi.webhook.goiY}</span> : <span className="huy-hieu">Chưa tạo</span>}{" "}
              {ketNoi.webhook.dangKyLuc ? <span className="huy-hieu tot">SNS đã xác nhận {dinhDangNgayGio(ketNoi.webhook.dangKyLuc)}</span> : <span className="huy-hieu canh-bao">SNS chưa xác nhận</span>}
            </p>
            {ketNoi.webhook.suKienCuoiLuc && <p>Sự kiện gần nhất: {dinhDangNgayGio(ketNoi.webhook.suKienCuoiLuc)}</p>}
            {urlWebhook && (
              <div className="hop-thong-bao canh-bao" role="status">
                Sao chép URL này vào đăng ký HTTPS của chủ đề SNS <strong>ngay bây giờ</strong> — URL chỉ hiện một lần:
                <br />
                <code style={{ wordBreak: "break-all" }}>{urlWebhook}</code>
              </div>
            )}
            {wh.loi && (
              <div className="hop-thong-bao loi" role="alert">
                {wh.loi.thongBao}
              </div>
            )}
            {duocSua && (
              <button type="button" className="nut" onClick={doiMaWebhook} disabled={wh.dangGui}>
                {ketNoi.webhook.coMa ? "Đổi mã webhook" : "Tạo URL webhook"}
              </button>
            )}
          </div>
        </section>
      )}

      <section className="the">
        <div className="dau">
          <h2>Gửi thư thử</h2>
        </div>
        <div className="than">
          <p className="phu">Gửi một thư ngắn tới <strong>{emailCuaToi}</strong> để chắc kết nối dùng được. Lưu kết nối trước khi thử.</p>
          {ketNoi.lanThuCuoi && (
            <p className="nho">
              Lần thử gần nhất {dinhDangNgayGio(ketNoi.lanThuCuoi.luc)}:{" "}
              {ketNoi.lanThuCuoi.ok ? <span className="huy-hieu tot">Thành công</span> : <span className="huy-hieu loi">Lỗi</span>}
              {ketNoi.lanThuCuoi.loi && <span className="chu-loi"> {ketNoi.lanThuCuoi.loi}</span>}
            </p>
          )}
          {thu.loi && (
            <div className="hop-thong-bao loi" role="alert">
              {thu.loi.thongBao}
            </div>
          )}
          {kqThu && (
            <div className={`hop-thong-bao ${kqThu.ok ? "tot" : "loi"}`} role="status">
              {kqThu.ok ? `Đã gửi tới ${kqThu.den}. Kiểm hộp thư (cả mục Thư rác).` : `Không gửi được: ${kqThu.loi}`}
            </div>
          )}
          {duocSua && (
            <button type="button" className="nut" onClick={guiThu} disabled={thu.dangGui || !ketNoi.daCauHinh}>
              {thu.dangGui ? "Đang gửi…" : "Gửi thư thử"}
            </button>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
