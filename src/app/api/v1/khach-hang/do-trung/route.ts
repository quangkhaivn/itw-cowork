import { docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoDoTrung } from "@/modules/khach-hang/luoc-do";
import { doTrungKhachHang } from "@/modules/khach-hang/service";

export const dynamic = "force-dynamic";

/** Dò khách có thể trùng trước khi lưu (KH-03). Quét toàn doanh nghiệp, chỉ trả mã + tên + người phụ trách. */
export const GET = xuLyApi((nc, req) => doTrungKhachHang(nc, docTruyVan(req, LuocDoDoTrung)));
