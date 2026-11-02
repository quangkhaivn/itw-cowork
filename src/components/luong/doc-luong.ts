import { LoiNghiepVu } from "@/lib/loi";
import { MA_LOI_2_LOP } from "@/modules/luong/chung";

/** Đọc dữ liệu lương cho trang: lỗi "cần 2 lớp" (LU-61) đổi thành cờ để trang hiện hướng dẫn bật thay vì lỗi chung. */
export async function docLuong<T>(f: () => Promise<T>): Promise<{ can2Lop: true; d?: undefined } | { can2Lop: false; d: T }> {
  try {
    return { can2Lop: false, d: await f() };
  } catch (e) {
    if (e instanceof LoiNghiepVu && e.ma === MA_LOI_2_LOP) return { can2Lop: true };
    throw e;
  }
}

export const tien = (n: number) => n.toLocaleString("vi-VN");
