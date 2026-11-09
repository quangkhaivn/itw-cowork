import { docThan, xuLyApi } from "@/lib/api";
import { anhXaPin, danhSachPinChuaKhop } from "@/modules/cham-cong/may-cham-cong";
import { LuocDoAnhXaPin } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachPinChuaKhop(nc));
/** POST { pin, nguoiId } — gán PIN chưa khớp cho một người; các lần chấm cũ được gán lại (NS-15). */
export const POST = xuLyApi(async (nc, req) => anhXaPin(nc, await docThan(req, LuocDoAnhXaPin)));
