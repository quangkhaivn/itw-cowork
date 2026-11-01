"use client";

import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Nút Duyệt / Từ chối / Hủy của một đơn. Quyền thật kiểm ở máy chủ (quản lý trực tiếp hoặc phạm vi
 * `cham_cong.approve`; không tự duyệt đơn của mình) — nút chỉ hiện khi máy chủ báo được làm.
 */
export default function NutQuyetDinh({
  url,
  duocDuyet,
  duocHuy,
  soGioXin,
}: {
  url: string;
  duocDuyet: boolean;
  duocHuy: boolean;
  /** Đơn tăng ca: cho sửa số giờ duyệt. */
  soGioXin?: number;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();

  async function lam(hanhDong: "duyet" | "tu-choi" | "huy") {
    let ghiChu: string | undefined;
    let gioDuyet: number | undefined;
    if (hanhDong === "duyet" && soGioXin !== undefined) {
      const s = window.prompt(`Số giờ duyệt (tối đa ${soGioXin}):`, String(soGioXin));
      if (s === null) return;
      gioDuyet = Number(s.replace(",", "."));
    }
    if (hanhDong !== "duyet") {
      ghiChu = window.prompt(hanhDong === "huy" ? "Lý do hủy:" : "Lý do từ chối:") ?? undefined;
      if (!ghiChu) return;
    }
    const kq = await goi<{ canhBao?: string[] }>(url, "POST", { hanhDong, ghiChu, gioDuyet });
    if (kq?.canhBao?.length) window.alert(`Đã duyệt. Lưu ý: ${kq.canhBao.join(" ")}`);
    if (kq) router.refresh();
  }

  if (!duocDuyet && !duocHuy) return null;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {duocDuyet && (
        <>
          <button type="button" className="nut nho chinh" disabled={dangGui} onClick={() => lam("duyet")}>Duyệt</button>{" "}
          <button type="button" className="nut nho nguy-hiem" disabled={dangGui} onClick={() => lam("tu-choi")}>Từ chối</button>{" "}
        </>
      )}
      {duocHuy && <button type="button" className="nut nho" disabled={dangGui} onClick={() => lam("huy")}>Hủy</button>}
      {loi && <div className="chu-loi nho" role="alert">{loi.thongBao}</div>}
    </span>
  );
}
