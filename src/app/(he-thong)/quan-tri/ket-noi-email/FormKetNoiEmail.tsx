"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import type { GoiYKetNoi } from "@/modules/email/tinh-toan";

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
}: {
  ketNoi: KetNoi;
  coKhoaMaHoa: boolean;
  goiY: GoiYKetNoi[];
  duocSua: boolean;
  emailCuaToi: string;
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
  });
  const [daLuu, datDaLuu] = useState(false);
  const [kqThu, datKqThu] = useState<{ ok: boolean; loi: string | null; den: string } | null>(null);
  const [huongDan, datHuongDan] = useState<string | null>(null);
  const doi = (k: keyof typeof f, v: string | boolean) => {
    datDaLuu(false);
    datF((c) => ({ ...c, [k]: v }));
  };

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi("/api/v1/email/ket-noi", "PUT", { ...f, port: Number(f.port), matKhau: f.matKhau || undefined });
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
          <h3>Máy chủ gửi thư (SMTP)</h3>
          {duocSua && (
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
            <div className="truong">
              <label htmlFor="kn-host">Máy chủ</label>
              <input id="kn-host" value={f.host} disabled={!duocSua} onChange={(e) => doi("host", e.target.value)} placeholder="smtp.gmail.com" required />
              {loiCua(loi, "host") && <span className="chu-loi">{loiCua(loi, "host")}</span>}
            </div>
            <div className="truong">
              <label htmlFor="kn-port">Cổng</label>
              <input id="kn-port" inputMode="numeric" value={f.port} disabled={!duocSua} onChange={(e) => doi("port", e.target.value)} required />
            </div>
            <div className="truong">
              <label htmlFor="kn-bm">Mã hóa kết nối</label>
              <select id="kn-bm" value={f.baoMat} disabled={!duocSua} onChange={(e) => doi("baoMat", e.target.value)}>
                <option value="tls">TLS ngay từ đầu (thường cổng 465)</option>
                <option value="starttls">STARTTLS (thường cổng 587)</option>
                <option value="none">Không mã hóa — chỉ máy chủ nội bộ, không đăng nhập</option>
              </select>
            </div>
            <div className="truong">
              <label htmlFor="kn-user">Tên đăng nhập</label>
              <input id="kn-user" autoComplete="off" value={f.tenDangNhap} disabled={!duocSua} onChange={(e) => doi("tenDangNhap", e.target.value)} />
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
              <input id="kn-ten" value={f.tenNguoiGui} disabled={!duocSua} onChange={(e) => doi("tenNguoiGui", e.target.value)} placeholder="Thế Giới Tin Học" required />
              {loiCua(loi, "tenNguoiGui") && <span className="chu-loi">{loiCua(loi, "tenNguoiGui")}</span>}
            </div>
            <div className="truong">
              <label htmlFor="kn-email">Địa chỉ gửi</label>
              <input id="kn-email" type="email" value={f.emailNguoiGui} disabled={!duocSua} onChange={(e) => doi("emailNguoiGui", e.target.value)} required />
              <span className="goi-y">Gmail / Microsoft 365 chỉ cho gửi bằng đúng địa chỉ của tài khoản đăng nhập (hoặc bí danh đã xác minh).</span>
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
  );
}
