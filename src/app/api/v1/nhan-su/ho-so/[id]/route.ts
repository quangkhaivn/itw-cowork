import { docThan, xuLyApi } from "@/lib/api";
import { chiTietHoSoNhanSu, suaHoSoNhanSu } from "@/modules/nhan-su/service";
import { LuocDoHoSoNhanSu } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietHoSoNhanSu(nc, id), { quyen: "nhan_su.view" });
export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaHoSoNhanSu(nc, id, await docThan(req, LuocDoHoSoNhanSu)), { quyen: "nhan_su.update" });
