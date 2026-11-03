import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { voiTenant } from "@/lib/db";
import { LoiNghiepVu } from "@/lib/loi";
import { ghiTuChoiQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import type { NguoiDungHienTai } from "@/lib/trang";
import { layIpKhach } from "@/lib/yeu-cau";
import { MA_LOI_2_LOP } from "@/modules/luong/chung";

/**
 * Đọc dữ liệu lương cho trang: lỗi "cần 2 lớp" (LU-61) đổi thành cờ để trang hiện hướng dẫn bật thay vì lỗi chung.
 * QA 0.21.0: thiếu quyền ở tầng service (vd nhân viên mở bản in phiếu lương / bảng lương của người khác) trước đây rơi
 * ra trang lỗi máy 500 và không ghi vết dò quyền — nay ghi vết như API rồi trả 404 (không lộ bản ghi có tồn tại, LU-05).
 */
export async function docLuong<T>(f: () => Promise<T>, nd?: NguoiDungHienTai): Promise<{ can2Lop: true; d?: undefined } | { can2Lop: false; d: T }> {
  try {
    return { can2Lop: false, d: await f() };
  } catch (e) {
    if (e instanceof LoiNghiepVu && e.ma === MA_LOI_2_LOP) return { can2Lop: true };
    if (e instanceof LoiThieuQuyen) {
      if (nd) {
        const h = await headers();
        await voiTenant(nd.phien.tenantId, (tx) =>
          ghiTuChoiQuyen(tx, { userId: nd.hoSo.userId, email: nd.hoSo.email, vaiTro: nd.hoSo.vaiTro.map((v) => v.code) }, e, { ipAddress: layIpKhach(h), userAgent: h.get("user-agent") }),
        ).catch(() => {});
      }
      notFound();
    }
    throw e;
  }
}

export const tien = (n: number) => n.toLocaleString("vi-VN");
