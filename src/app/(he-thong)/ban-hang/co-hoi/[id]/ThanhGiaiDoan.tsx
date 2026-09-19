"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import HopDoiGiaiDoan, { type YeuCauDoiGiaiDoan } from "@/components/crm/HopDoiGiaiDoan";
import { GIAI_DOAN_CO_HOI, NHAN_GIAI_DOAN, laCoHoiDangMo, type GiaiDoanCoHoi } from "@/modules/crm/hang-so";

/**
 * Thanh giai đoạn trên trang chi tiết cơ hội: bấm một giai đoạn để chuyển.
 * Cơ hội đã đóng chỉ người có quyền duyệt mới mở lại được (CH-06) — nút khác bị khóa.
 */
export default function ThanhGiaiDoan({
  coHoiId,
  tieuDe,
  giaiDoan,
  duocSua,
  duocMoLai,
  lyDoThua,
}: {
  coHoiId: string;
  tieuDe: string;
  giaiDoan: string;
  duocSua: boolean;
  duocMoLai: boolean;
  lyDoThua: { ma: string; ten: string }[];
}) {
  const router = useRouter();
  const [yeuCau, datYeuCau] = useState<YeuCauDoiGiaiDoan | null>(null);
  const dangMo = laCoHoiDangMo(giaiDoan);
  const viTri = GIAI_DOAN_CO_HOI.indexOf(giaiDoan as GiaiDoanCoHoi);

  return (
    <>
      <ol className="thanh-giai-doan" aria-label="Giai đoạn cơ hội">
        {GIAI_DOAN_CO_HOI.map((gd, i) => {
          const hienTai = gd === giaiDoan;
          const choPhep = duocSua && !hienTai && (dangMo || duocMoLai);
          return (
            <li key={gd} data-trang-thai={hienTai ? "hien-tai" : i < viTri && dangMo ? "da-qua" : ""} data-giai-doan={gd}>
              <button
                type="button"
                disabled={!choPhep}
                aria-current={hienTai ? "step" : undefined}
                onClick={() => datYeuCau({ coHoiId, tieuDe, tu: giaiDoan, den: gd })}
                title={!duocSua ? "Bạn không sửa được cơ hội này" : !dangMo && !duocMoLai ? "Cơ hội đã đóng — cần quyền duyệt để mở lại" : undefined}
              >
                {NHAN_GIAI_DOAN[gd]}
              </button>
            </li>
          );
        })}
      </ol>
      <HopDoiGiaiDoan
        yeuCau={yeuCau}
        lyDoThua={lyDoThua}
        dong={() => datYeuCau(null)}
        xong={() => {
          datYeuCau(null);
          router.refresh();
        }}
      />
    </>
  );
}
