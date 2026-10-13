import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoTuyChonDanhSach, luuTuyChonDanhSach, tuyChonDanhSach } from "@/modules/khach-hang/bo-loc";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => tuyChonDanhSach(nc), { quyen: "customer.view" });

export const PUT = xuLyApi(async (nc, req) => luuTuyChonDanhSach(nc, await docThan(req, LuocDoTuyChonDanhSach)), { quyen: "customer.view" });
