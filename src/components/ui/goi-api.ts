"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Gọi API nghiệp vụ từ form phía trình duyệt, gom trạng thái đang gửi / lỗi / lỗi từng trường.
 * Mọi form trong hệ thống dùng chung hook này để thông báo lỗi nhất quán.
 */

export interface LoiApi {
  thongBao: string;
  loiTruong: Record<string, string[] | undefined>;
  status: number;
  /** Mã lỗi nghiệp vụ, ví dụ "co-the-trung", "trung-ma-so-thue". */
  ma?: string;
  /** Dữ liệu kèm lỗi (danh sách bản ghi có thể trùng…). */
  chiTiet?: unknown;
}

export function useGoiApi() {
  const router = useRouter();
  const [dangGui, datDangGui] = useState(false);
  const [loi, datLoi] = useState<LoiApi | null>(null);

  const goi = useCallback(async <T = unknown>(url: string, phuongThuc: string, than?: unknown): Promise<T | null> => {
    datDangGui(true);
    datLoi(null);
    try {
      const phanHoi = await fetch(url, {
        method: phuongThuc,
        headers: than === undefined ? undefined : { "Content-Type": "application/json" },
        body: than === undefined ? undefined : JSON.stringify(than),
      });
      const duLieu = await phanHoi.json().catch(() => ({}));
      if (!phanHoi.ok) {
        if (phanHoi.status === 401) {
          router.push("/dang-nhap");
          return null;
        }
        datLoi({
          thongBao: duLieu.thongBao ?? `Lỗi ${phanHoi.status}.`,
          loiTruong: duLieu.loiTruong ?? {},
          status: phanHoi.status,
          ma: duLieu.ma,
          chiTiet: duLieu.chiTiet,
        });
        return null;
      }
      return duLieu as T;
    } catch {
      datLoi({ thongBao: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.", loiTruong: {}, status: 0 });
      return null;
    } finally {
      datDangGui(false);
    }
  }, [router]);

  return { goi, dangGui, loi, datLoi };
}

/** Lỗi đầu tiên của một trường, để hiện dưới ô nhập. */
export function loiCua(loi: LoiApi | null, truong: string): string | undefined {
  return loi?.loiTruong?.[truong]?.[0];
}
