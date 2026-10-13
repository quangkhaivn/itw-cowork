import { xuLyApi } from "@/lib/api";
import { xuatKhachCsv } from "@/modules/khach-hang/nhap-xuat";

export const dynamic = "force-dynamic";

/** Xuất theo đúng bộ lọc trên URL của danh sách. */
export const GET = xuLyApi((nc, req) => xuatKhachCsv(nc, Object.fromEntries(req.nextUrl.searchParams.entries())), { quyen: "customer.export" });
