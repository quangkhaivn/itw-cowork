"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TrangDangNhap() {
  const router = useRouter();
  const [dangGui, datDangGui] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);

  async function guiForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);

    const form = new FormData(e.currentTarget);
    try {
      const phanHoi = await fetch("/api/dang-nhap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maDoanhNghiep: String(form.get("maDoanhNghiep") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          matKhau: String(form.get("matKhau") ?? ""),
        }),
      });
      const ketQua = await phanHoi.json().catch(() => ({}));
      if (!phanHoi.ok) {
        datLoi(ketQua.thongBao ?? "Đăng nhập không thành công.");
        datDangGui(false);
        return;
      }
      router.push(ketQua.chuyenDen ?? "/bang-dieu-khien");
      router.refresh();
    } catch {
      datLoi("Không kết nối được máy chủ. Thử lại sau.");
      datDangGui(false);
    }
  }

  return (
    <main className="giua">
      <form className="the the-don" onSubmit={guiForm}>
        <h1>TGTH Business Cowork</h1>
        <p className="phu">Công ty Cổ phần Thế Giới Tin Học</p>

        {loi && (
          <div className="hop-thong-bao loi" role="alert">
            {loi}
          </div>
        )}

        <div className="truong">
          <label htmlFor="maDoanhNghiep">Mã doanh nghiệp</label>
          <input id="maDoanhNghiep" name="maDoanhNghiep" type="text" defaultValue="itw" required autoComplete="organization" />
        </div>
        <div className="truong">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" autoFocus />
        </div>
        <div className="truong">
          <label htmlFor="matKhau">Mật khẩu</label>
          <input id="matKhau" name="matKhau" type="password" required autoComplete="current-password" />
        </div>

        <button className="nut chinh" type="submit" disabled={dangGui}>
          {dangGui ? "Đang kiểm tra…" : "Đăng nhập"}
        </button>
        <p className="phu nho" style={{ marginTop: 14, marginBottom: 0 }}>
          Quên mật khẩu: liên hệ Quản trị hệ thống để được đặt lại.
        </p>
      </form>
    </main>
  );
}
