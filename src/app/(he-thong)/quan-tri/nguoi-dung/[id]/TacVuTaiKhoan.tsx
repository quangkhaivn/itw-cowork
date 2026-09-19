"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { kiemTraMatKhauManh, sinhMatKhauTam } from "@/lib/mat-khau";

/** Các thao tác trên tài khoản: khóa / mở lại, mở khóa đăng nhập, đặt lại mật khẩu. */
export default function TacVuTaiKhoan({
  id,
  trangThai,
  dangKhoa,
  laChinhMinh,
}: {
  id: string;
  trangThai: string;
  dangKhoa: boolean;
  laChinhMinh: boolean;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [thongBao, datThongBao] = useState<string | null>(null);
  const [moDatLai, datMoDatLai] = useState(false);
  const [matKhau, datMatKhau] = useState("");
  const loiMatKhau = matKhau ? kiemTraMatKhauManh(matKhau) : [];

  async function doiTrangThai() {
    const moi = trangThai === "hoat-dong" ? "ngung-hoat-dong" : "hoat-dong";
    const cauHoi =
      moi === "ngung-hoat-dong"
        ? "Ngừng hoạt động tài khoản này? Người dùng bị đăng xuất ngay và không đăng nhập được nữa. Dữ liệu và lịch sử vẫn giữ nguyên."
        : "Mở lại tài khoản này?";
    if (!window.confirm(cauHoi)) return;
    const kq = await goi(`/api/v1/nguoi-dung/${id}`, "PATCH", { trangThai: moi });
    if (kq) {
      datThongBao(moi === "ngung-hoat-dong" ? "Đã ngừng hoạt động tài khoản." : "Đã mở lại tài khoản.");
      router.refresh();
    }
  }

  async function moKhoa() {
    const kq = await goi(`/api/v1/nguoi-dung/${id}`, "PATCH", { moKhoaDangNhap: true });
    if (kq) {
      datThongBao("Đã mở khóa đăng nhập.");
      router.refresh();
    }
  }

  async function datLai(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi(`/api/v1/nguoi-dung/${id}/dat-lai-mat-khau`, "POST", { matKhauMoi: matKhau, batDoiMatKhau: true });
    if (kq) {
      datThongBao("Đã đặt lại mật khẩu. Người dùng bị đăng xuất khỏi mọi thiết bị và phải đổi mật khẩu ở lần đăng nhập kế tiếp.");
      datMoDatLai(false);
      datMatKhau("");
      router.refresh();
    }
  }

  return (
    <section className="the">
      <div className="dau">
        <h2>Tác vụ tài khoản</h2>
      </div>
      <div className="than">
        {loi && (
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        )}
        {thongBao && (
          <div className="hop-thong-bao tot" role="status">
            {thongBao}
          </div>
        )}

        <div className="hanh-dong" style={{ marginBottom: 12 }}>
          {dangKhoa && (
            <button className="nut" onClick={moKhoa} disabled={dangGui}>
              Mở khóa đăng nhập
            </button>
          )}
          {!laChinhMinh && (
            <button className="nut" onClick={() => datMoDatLai((m) => !m)} disabled={dangGui}>
              Đặt lại mật khẩu
            </button>
          )}
          {!laChinhMinh && (
            <button className={`nut ${trangThai === "hoat-dong" ? "nguy-hiem" : ""}`} onClick={doiTrangThai} disabled={dangGui}>
              {trangThai === "hoat-dong" ? "Ngừng hoạt động" : "Mở lại tài khoản"}
            </button>
          )}
        </div>
        {laChinhMinh && <p className="phu">Đây là tài khoản của bạn. Đổi mật khẩu ở mục Tài khoản của tôi.</p>}

        {moDatLai && (
          <form onSubmit={datLai}>
            <div className="truong">
              <label htmlFor="matKhauMoi">Mật khẩu mới</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  id="matKhauMoi"
                  type="text"
                  value={matKhau}
                  onChange={(e) => datMatKhau(e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-invalid={loiMatKhau.length > 0 || undefined}
                />
                <button type="button" className="nut" onClick={() => datMatKhau(sinhMatKhauTam())}>
                  Tạo ngẫu nhiên
                </button>
              </div>
              <span className={loiMatKhau.length ? "loi-truong" : "goi-y"}>
                {loiMatKhau.length ? loiMatKhau.join(" ") : "Người dùng sẽ phải đổi lại ở lần đăng nhập kế tiếp."}
              </span>
            </div>
            <button className="nut chinh" type="submit" disabled={dangGui || !matKhau || loiMatKhau.length > 0}>
              Xác nhận đặt lại
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
