import { docThan, xuLyApi } from "@/lib/api";
import { themKhoanLuong } from "@/modules/luong/service";
import { LuocDoKhoan } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

/** POST — thêm khoản cộng / trừ / điều chỉnh kỳ trước vào kỳ NHÁP (LU-25, LU-31). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => themKhoanLuong(nc, id, await docThan(req, LuocDoKhoan)), { quyen: "luong.create" });
