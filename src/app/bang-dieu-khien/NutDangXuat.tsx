"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NutDangXuat() {
  const router = useRouter();
  const [dangThoat, datDangThoat] = useState(false);

  async function thoat() {
    datDangThoat(true);
    await fetch("/api/dang-xuat", { method: "POST" });
    router.push("/dang-nhap");
    router.refresh();
  }

  return (
    <button className="thoat" onClick={thoat} disabled={dangThoat}>
      {dangThoat ? "Đang thoát..." : "Đăng xuất"}
    </button>
  );
}
