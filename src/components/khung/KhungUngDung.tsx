"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ThanhBen from "./ThanhBen";
import ThanhTren from "./ThanhTren";
import HopTimKiem from "./HopTimKiem";
import type { NhomDieuHuong } from "./dieu-huong";
import type { MucTaoNhanh } from "./TaoNhanh";

/**
 * Khung ứng dụng phía trình duyệt: giữ trạng thái mở menu trên điện thoại và hộp tìm kiếm.
 * Danh sách menu đã được máy chủ lọc theo quyền trước khi truyền vào — trình duyệt
 * không bao giờ nhận mục mà người dùng không được thấy.
 */
export default function KhungUngDung({
  dieuHuong,
  nguoiDung,
  tenDoanhNghiep,
  taoNhanh,
  children,
}: {
  dieuHuong: NhomDieuHuong[];
  nguoiDung: { hoTen: string; email: string; vaiTro: string };
  tenDoanhNghiep: string;
  taoNhanh: MucTaoNhanh[];
  children: React.ReactNode;
}) {
  const [menuMoTai, datMenuMoTai] = useState<string | null>(null);
  const [moTim, datMoTim] = useState(false);
  const duongDan = usePathname();
  // Menu điện thoại chỉ mở trên đúng trang đã bấm mở — đổi trang là tự đóng.
  const moMenu = menuMoTai === duongDan;

  useEffect(() => {
    const nghe = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        datMoTim((m) => !m);
      }
    };
    window.addEventListener("keydown", nghe);
    return () => window.removeEventListener("keydown", nghe);
  }, []);

  return (
    <div className="ung-dung" data-mo-menu={moMenu}>
      <ThanhBen dieuHuong={dieuHuong} tenDoanhNghiep={tenDoanhNghiep} />
      <div className="man-che" onClick={() => datMenuMoTai(null)} aria-hidden="true" />
      <div className="vung-chinh">
        <ThanhTren
          nguoiDung={nguoiDung}
          batMenu={() => datMenuMoTai(moMenu ? null : duongDan)}
          moTimKiem={() => datMoTim(true)}
          taoNhanh={taoNhanh}
        />
        <main className="noi-dung">{children}</main>
      </div>
      {moTim && <HopTimKiem dong={() => datMoTim(false)} />}
    </div>
  );
}
