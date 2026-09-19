"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BieuTuong from "@/components/ui/BieuTuong";
import TaoNhanh, { type MucTaoNhanh } from "./TaoNhanh";

function chuCaiDau(hoTen: string) {
  const tu = hoTen.trim().split(/\s+/);
  return ((tu.at(-2)?.[0] ?? "") + (tu.at(-1)?.[0] ?? "")).toUpperCase() || "?";
}

export default function ThanhTren({
  nguoiDung,
  batMenu,
  moTimKiem,
  taoNhanh,
}: {
  nguoiDung: { hoTen: string; email: string; vaiTro: string };
  batMenu: () => void;
  moTimKiem: () => void;
  taoNhanh: MucTaoNhanh[];
}) {
  const router = useRouter();
  const [moMenu, datMoMenu] = useState(false);
  const [dangThoat, datDangThoat] = useState(false);
  const vung = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moMenu) return;
    const dong = (e: MouseEvent) => {
      if (vung.current && !vung.current.contains(e.target as Node)) datMoMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") datMoMenu(false);
    };
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", esc);
    };
  }, [moMenu]);

  async function thoat() {
    datDangThoat(true);
    await fetch("/api/dang-xuat", { method: "POST" }).catch(() => {});
    router.push("/dang-nhap");
    router.refresh();
  }

  return (
    <header className="thanh-tren">
      <button className="nut trong icon nut-menu" onClick={batMenu} aria-label="Mở menu">
        <BieuTuong ten="menu" />
      </button>
      <button className="o-tim" onClick={moTimKiem} aria-label="Tìm kiếm (Ctrl+K)">
        <BieuTuong ten="tim-kiem" co={16} />
        <span>Tìm khách hàng, MST, điện thoại, cơ hội…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="dem" />
      <TaoNhanh muc={taoNhanh} />
      <div className="menu-nguoi" ref={vung}>
        <button onClick={() => datMoMenu((m) => !m)} aria-haspopup="menu" aria-expanded={moMenu}>
          <span className="anh-dai-dien" aria-hidden="true">
            {chuCaiDau(nguoiDung.hoTen)}
          </span>
          <span className="ten">
            {nguoiDung.hoTen}
            <small>{nguoiDung.vaiTro}</small>
          </span>
          <BieuTuong ten="mui-ten-xuong" co={14} />
        </button>
        {moMenu && (
          <div className="menu-tha" role="menu">
            <div className="phu nho" style={{ padding: "6px 10px" }}>
              {nguoiDung.email}
            </div>
            <hr />
            <Link href="/tai-khoan" role="menuitem" onClick={() => datMoMenu(false)}>
              Tài khoản của tôi
            </Link>
            <Link href="/doi-mat-khau" role="menuitem" onClick={() => datMoMenu(false)}>
              Đổi mật khẩu
            </Link>
            <hr />
            <button role="menuitem" onClick={thoat} disabled={dangThoat}>
              {dangThoat ? "Đang đăng xuất…" : "Đăng xuất"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
