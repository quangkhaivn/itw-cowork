/**
 * Đổi ảnh sang JPEG cho Instagram (0.24.0, QĐ-212) bằng `sharp` — thư viện ảnh ĐÃ CÓ trong cây phụ thuộc (phụ thuộc tùy
 * chọn của Next.js, có trong package-lock), KHÔNG thêm vào package.json. Nạp động: máy không cài được sharp (thiếu
 * libvips cho kiến trúc máy) → `coThuVienAnh()` = false → luật nền tảng từ chối ảnh không phải JPEG kèm hướng dẫn tự đổi.
 */

type HamSharp = (dauVao: Buffer, tuyChon?: Record<string, unknown>) => {
  rotate(): ReturnType<HamSharp>;
  flatten(o: { background: string }): ReturnType<HamSharp>;
  jpeg(o: { quality: number; mozjpeg?: boolean }): ReturnType<HamSharp>;
  toBuffer(): Promise<Buffer>;
};

let daNap: Promise<HamSharp | null> | null = null;

async function napSharp(): Promise<HamSharp | null> {
  if (process.env.MXH_TAT_DOI_JPEG === "1") return null;
  if (!daNap) {
    daNap = (async () => {
      try {
        const ten = "sharp";
        const m = (await import(/* webpackIgnore: true */ ten)) as { default?: HamSharp } & HamSharp;
        return (m.default ?? m) as HamSharp;
      } catch {
        return null;
      }
    })();
  }
  return daNap;
}

export async function coThuVienAnh(): Promise<boolean> {
  return (await napSharp()) !== null;
}

/** Đổi sang JPEG (xoay theo EXIF, nền trắng cho ảnh trong suốt, chất lượng 90). Không có thư viện → null. */
export async function doiSangJpeg(anh: Buffer): Promise<Buffer | null> {
  const s = await napSharp();
  if (!s) return null;
  return s(anh, { failOn: "error" }).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** CHỈ bài thử: nạp lại (sau khi đổi biến MXH_TAT_DOI_JPEG). */
export function napLaiThuVienAnhChoBaiThu(): void {
  if (process.env.NODE_ENV === "production") throw new Error("Không dùng trên môi trường thật.");
  daNap = null;
}
