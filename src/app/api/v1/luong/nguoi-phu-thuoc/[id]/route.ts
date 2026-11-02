import { docThan, xuLyApi } from "@/lib/api";
import { ketThucNguoiPhuThuoc } from "@/modules/luong/ho-so";
import { LuocDoKetThucNguoiPhuThuoc } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

/** PATCH — kết thúc giảm trừ từ sau tháng chọn (không xóa). */
export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => ketThucNguoiPhuThuoc(nc, id, await docThan(req, LuocDoKetThucNguoiPhuThuoc)), { quyen: "luong.update" });
