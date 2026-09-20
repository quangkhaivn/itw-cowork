"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BieuTuong from "@/components/ui/BieuTuong";
import type { NhomDieuHuong } from "./dieu-huong";

export default function ThanhBen({
  dieuHuong,
  tenDoanhNghiep,
}: {
  dieuHuong: NhomDieuHuong[];
  tenDoanhNghiep: string;
}) {
  const duongDan = usePathname();
  const dangChon = (href: string) => duongDan === href || duongDan.startsWith(href + "/");

  return (
    <aside className="ben-trai" aria-label="Điều hướng chính">
      <div className="thuong-hieu">
        <span className="logo" aria-hidden="true">
          TG
        </span>
        <span>
          TGTH Business Cowork
          <small>{tenDoanhNghiep}</small>
        </span>
      </div>
      <nav>
        {dieuHuong.map((nhom) => (
          <div className="nhom" key={nhom.nhan}>
            <div className="nhom-nhan">{nhom.nhan}</div>
            {nhom.muc.map((m) => (
              <Link key={m.href} href={m.href} className="muc" aria-current={dangChon(m.href) ? "page" : undefined}>
                <BieuTuong ten={m.bieuTuong} />
                {m.nhan}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="chan">Phase 5 · Đơn hàng &amp; kho</div>
    </aside>
  );
}
