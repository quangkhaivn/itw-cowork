import { NextResponse } from "next/server";
import { xuLyApi } from "@/lib/api";
import { taiTep } from "@/modules/dinh-kem/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tải tệp về.
 *
 * Luôn gửi kèm `Content-Disposition: attachment` để trình duyệt **tải xuống** chứ
 * không mở trong tab — một tệp mở thẳng trong tab là một tệp chạy được trên đúng
 * tên miền của hệ thống. Kiểu tệp lấy từ bản ghi của mình, không lấy từ tên tệp
 * người dùng đặt, và `nosniff` đã bật sẵn cho mọi đường dẫn.
 */
export const GET = xuLyApi<{ id: string }>(async (nc, _req, { id }) => {
  const { thongTin, noiDung } = await taiTep(nc, id);
  // RFC 5987: tên tệp tiếng Việt có dấu đi qua được mọi trình duyệt.
  const tenMaHoa = encodeURIComponent(thongTin.tenTep);
  return new NextResponse(new Uint8Array(noiDung), {
    status: 200,
    headers: {
      "Content-Type": thongTin.kieuTep,
      "Content-Length": String(noiDung.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${tenMaHoa}`,
      "Cache-Control": "private, no-store",
    },
  });
});
