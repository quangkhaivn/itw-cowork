import { docThan, xuLyApi } from "@/lib/api";
import { luuMauNganHang, xemMauNganHang } from "@/modules/luong/tham-so";
import { LuocDoXuatNganHang } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi(async (nc) => xemMauNganHang(nc), { quyen: "luong.export" });
export const PUT = xuLyApi(async (nc, req) => luuMauNganHang(nc, await docThan(req, LuocDoXuatNganHang)), { quyen: "luong.export" });
