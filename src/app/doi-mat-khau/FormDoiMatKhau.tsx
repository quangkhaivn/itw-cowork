"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { kiemTraMatKhauManh } from "@/lib/mat-khau";

export default function FormDoiMatKhau({ email, batBuoc }: { email: string; batBuoc: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState({ matKhauHienTai: "", matKhauMoi: "", nhapLai: "" });
  const loiMoi = gt.matKhauMoi ? kiemTraMatKhauManh(gt.matKhauMoi, email) : [];
  const khongKhop = gt.nhapLai.length > 0 && gt.nhapLai !== gt.matKhauMoi;

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi("/api/v1/tai-khoan/doi-mat-khau", "POST", gt);
    if (kq) {
      router.push("/bang-dieu-khien");
      router.refresh();
    }
  }

  return (
    <main className="giua">
      <form className="the the-don" onSubmit={gui} noValidate>
        <h1>Đổi mật khẩu</h1>
        <p className="phu">
          {batBuoc
            ? "Đây là lần đăng nhập đầu hoặc mật khẩu vừa được quản trị viên đặt lại. Đặt mật khẩu của riêng bạn để tiếp tục."
            : "Sau khi đổi, các phiên đăng nhập trên thiết bị khác sẽ bị đăng xuất."}
        </p>
        {loi && (
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        )}
        <div className="truong">
          <label htmlFor="matKhauHienTai">Mật khẩu hiện tại</label>
          <input
            id="matKhauHienTai"
            type="password"
            autoComplete="current-password"
            value={gt.matKhauHienTai}
            onChange={(e) => datGt({ ...gt, matKhauHienTai: e.target.value })}
            aria-invalid={Boolean(loiCua(loi, "matKhauHienTai")) || loi?.status === 422 || undefined}
            required
          />
        </div>
        <div className="truong">
          <label htmlFor="matKhauMoi">Mật khẩu mới</label>
          <input
            id="matKhauMoi"
            type="password"
            autoComplete="new-password"
            value={gt.matKhauMoi}
            onChange={(e) => datGt({ ...gt, matKhauMoi: e.target.value })}
            aria-invalid={loiMoi.length > 0 || undefined}
            required
          />
          <span className={loiMoi.length ? "loi-truong" : "goi-y"}>
            {loiMoi.length ? loiMoi.join(" ") : "Tối thiểu 10 ký tự, có chữ và số, không chứa tên đăng nhập."}
          </span>
        </div>
        <div className="truong">
          <label htmlFor="nhapLai">Nhập lại mật khẩu mới</label>
          <input
            id="nhapLai"
            type="password"
            autoComplete="new-password"
            value={gt.nhapLai}
            onChange={(e) => datGt({ ...gt, nhapLai: e.target.value })}
            aria-invalid={khongKhop || undefined}
            required
          />
          {(khongKhop || loiCua(loi, "nhapLai")) && (
            <span className="loi-truong">{loiCua(loi, "nhapLai") ?? "Hai lần nhập không khớp."}</span>
          )}
        </div>
        <button
          className="nut chinh"
          type="submit"
          disabled={dangGui || !gt.matKhauHienTai || loiMoi.length > 0 || !gt.matKhauMoi || khongKhop}
        >
          {dangGui ? "Đang đổi…" : "Đổi mật khẩu"}
        </button>
        {!batBuoc && (
          <p style={{ marginTop: 14, textAlign: "center" }}>
            <Link href="/tai-khoan">Quay lại</Link>
          </p>
        )}
      </form>
    </main>
  );
}
