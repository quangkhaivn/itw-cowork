import { docThan, xuLyApi } from "@/lib/api";
import { themNguoiPhuThuoc } from "@/modules/luong/ho-so";
import { LuocDoNguoiPhuThuoc } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

export const POST = xuLyApi(async (nc, req) => themNguoiPhuThuoc(nc, await docThan(req, LuocDoNguoiPhuThuoc)), { quyen: "luong.update" });
