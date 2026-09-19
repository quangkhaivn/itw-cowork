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
      const ketQua = await phanHoi.json();
      if (!phanHoi.ok) {
        datLoi(ketQua.thongBao ?? "Đăng nhập không thành công.");
        datDangGui(false);
        return;
      }
      router.push("/bang-dieu-khien");
      router.refresh();
    } catch {
      datLoi("Không kết nối được máy chủ. Thử lại sau.");
      datDangGui(false);
    }
  }

  return (
    <main className="giua">
      <form className="the" onSubmit={guiForm}>
        <h1>Cowork Business OS</h1>
        <p className="phu">Công ty Cổ phần Thế Giới Tin Học — ITW</p>

        <label htmlFor="maDoanhNghiep">Mã doanh nghiệp</label>
        <input id="maDoanhNghiep" name="maDoanhNghiep" defaultValue="itw" required autoComplete="organization" />

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" />

        <label htmlFor="matKhau">Mật khẩu</label>
        <input id="matKhau" name="matKhau" type="password" required autoComplete="current-password" />

        <button type="submit" disabled={dangGui}>
          {dangGui ? "Đang kiểm tra..." : "Đăng nhập"}
        </button>

        {loi && <p className="loi">{loi}</p>}
      </form>
    </main>
  );
}
