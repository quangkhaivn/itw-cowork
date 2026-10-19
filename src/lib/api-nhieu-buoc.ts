import { NextRequest, NextResponse } from "next/server";
import { voiTenant, type ClientTenant, type TuyChonGiaoDich } from "./db";
import { kiemHoSoTrongGiaoDich, taoNguCanh, traLoiChuaDangNhap, xuLyLoiApi, type NguCanh, type TuyChonApi } from "./api";
import { layPhienHienTai } from "./xac-thuc";
import { layIpKhach } from "./yeu-cau";
import { LoiKhongTimThay } from "./loi";
import type { HoSoQuyen } from "./phan-quyen";

/**
 * Lớp bọc cho route phải **gọi mạng** (mô hình AI, SMTP) hoặc chạy việc dài — QĐ-89.
 *
 * `xuLyApi` mở MỘT giao dịch cho cả yêu cầu. Gọi mạng bên trong giao dịch đó nghĩa là giữ một
 * kết nối CSDL (và khóa dòng) trong lúc chờ máy ngoài — mô hình AI trả lời 30–60 giây là quá hạn
 * 5 giây của Prisma, và vài người hỏi cùng lúc là cạn kết nối của cả hệ thống.
 *
 * Ở đây route nhận `BuocGiaoDich`: mỗi lần cần CSDL thì mở một giao dịch NGẮN bằng
 * `nb.giaoDich(nc => …)`; phần gọi mạng nằm giữa các bước, ngoài mọi giao dịch. Mỗi bước kiểm lại
 * hồ sơ quyền (phiên bị thu hồi / mất quyền giữa chừng thì bước sau bị chặn), đặt tenant và RLS
 * y như `xuLyApi`. Đổi lại: các bước KHÔNG cuộn ngược cùng nhau — service phải tự sắp thứ tự ghi
 * sao cho hỏng ở giữa vẫn để lại dữ liệu có nghĩa (ví dụ: câu hỏi đã ghi, câu trả lời ghi lỗi).
 */

export interface BuocGiaoDich {
  /** Mở một giao dịch ngắn trong ngữ cảnh người đang gọi. */
  giaoDich<T>(khoi: (nc: NguCanh) => Promise<T>, tuyChon?: TuyChonGiaoDich): Promise<T>;
}

/**
 * Đổi một `NguCanh` (đã nằm trong một giao dịch) thành `BuocGiaoDich` chạy mọi bước trong chính
 * giao dịch đó. Chỉ để giữ tương thích cho bài thử / chỗ gọi cũ — đường HTTP thật dùng
 * `xuLyApiNhieuBuoc`, nơi mỗi bước là một giao dịch riêng.
 */
export function thanhBuoc(x: NguCanh | BuocGiaoDich): BuocGiaoDich {
  if ("giaoDich" in x) return x;
  return { giaoDich: (khoi) => khoi(x) };
}

/** Dựng `BuocGiaoDich` cho một người dùng đã biết (bài thử, tác vụ nền chạy thay người). */
export function buocChoNguoiDung(
  tenantId: string,
  docHoSo: (tx: ClientTenant) => Promise<HoSoQuyen>,
  ip: string | null = null,
  userAgent: string | null = null,
): BuocGiaoDich {
  return {
    giaoDich: (khoi, tc) =>
      voiTenant(tenantId, async (tx) => khoi(taoNguCanh(tx, tenantId, await docHoSo(tx), ip, userAgent)), tc),
  };
}

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TuyChonNhieuBuoc = Pick<TuyChonApi, "quyen" | "choPhepKhiPhaiDoiMatKhau" | "choPhepKhiPhaiBat2Lop">;

export function xuLyApiNhieuBuoc<P extends Record<string, string> = Record<string, never>>(
  xuLy: (nb: BuocGiaoDich, req: NextRequest, thamSo: P) => Promise<unknown>,
  tuyChon: TuyChonNhieuBuoc = {},
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<NextResponse> => {
    const phien = await layPhienHienTai();
    if (!phien) return traLoiChuaDangNhap();

    const ip = layIpKhach(req.headers);
    const userAgent = req.headers.get("user-agent");
    let hoSoDaDoc: HoSoQuyen | null = null;

    const nb: BuocGiaoDich = {
      giaoDich: (khoi, tc) =>
        voiTenant(
          phien.tenantId,
          async (tx) => {
            const hoSo = await kiemHoSoTrongGiaoDich(tx, phien, tuyChon, (h) => (hoSoDaDoc = h));
            return khoi(taoNguCanh(tx, phien.tenantId, hoSo, ip, userAgent));
          },
          tc,
        ),
    };

    try {
      const thamSo = ((await ctx?.params) ?? {}) as P;
      for (const [khoa, giaTri] of Object.entries(thamSo)) {
        if ((khoa === "id" || khoa.endsWith("Id")) && !LA_UUID.test(String(giaTri))) throw new LoiKhongTimThay();
      }
      // Kiểm phiên + quyền của route NGAY, trước khi service làm gì — kể cả gọi mạng.
      await nb.giaoDich(async () => undefined);
      const ketQua = await xuLy(nb, req, thamSo);
      if (ketQua instanceof NextResponse) return ketQua;
      return NextResponse.json(ketQua ?? { ok: true });
    } catch (loi) {
      return xuLyLoiApi(loi, phien, hoSoDaDoc, ip, userAgent);
    }
  };
}
