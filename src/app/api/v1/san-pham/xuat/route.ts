import { xuLyApi } from "@/lib/api";
import { xuatSanPhamCsv } from "@/modules/san-pham/nhap-xuat";

export const dynamic = "force-dynamic";

/** Xuất CSV theo đúng bộ lọc đang xem. Trả JSON { tenTep, noiDung } để trình duyệt tải về. */
export const GET = xuLyApi((nc, req) => xuatSanPhamCsv(nc, Object.fromEntries(req.nextUrl.searchParams.entries())), {
  quyen: "product.export",
});
