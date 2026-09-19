"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BieuTuong from "@/components/ui/BieuTuong";

export interface MucTaoNhanh {
  nhan: string;
  href: string;
}

/**
 * Nút "+ Tạo mới" trên thanh trên (mục 24 prompt 20/09). Danh sách do máy chủ lọc theo
 * quyền và chỉ gồm loại bản ghi đã có màn hình tạo — Báo giá, Đơn hàng, Phiếu hỗ trợ
 * thêm vào khi các phân hệ đó chạy.
 */
export default function TaoNhanh({ muc }: { muc: MucTaoNhanh[] }) {
  const [mo, datMo] = useState(false);
  const vung = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      if (vung.current && !vung.current.contains(e.target as Node)) datMo(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && datMo(false);
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", esc);
    };
  }, [mo]);

  if (muc.length === 0) return null;
  return (
    <div className="tao-nhanh" ref={vung}>
      <button className="nut chinh" onClick={() => datMo((m) => !m)} aria-haspopup="menu" aria-expanded={mo}>
        <BieuTuong ten="them" co={16} />
        <span className="an-tren-dt">Tạo mới</span>
      </button>
      {mo && (
        <div className="menu-tha" role="menu">
          {muc.map((m) => (
            <Link key={m.href} href={m.href} role="menuitem" onClick={() => datMo(false)}>
              {m.nhan}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
