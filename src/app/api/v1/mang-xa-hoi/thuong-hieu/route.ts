import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoThuongHieu } from "@/modules/mang-xa-hoi/luoc-do";
import { luuHoSoThuongHieu, xemHoSoThuongHieu } from "@/modules/mang-xa-hoi/thuong-hieu";

/** Hồ sơ thương hiệu (QĐ-235). Sửa: người có mxh.approve hoặc setting.update (kiểm trong service). */
export const GET = xuLyApi((nc) => xemHoSoThuongHieu(nc), { quyen: "mxh.view" });
export const PUT = xuLyApi(async (nc, req) => luuHoSoThuongHieu(nc, await docThan(req, LuocDoThuongHieu)), { quyen: "mxh.view" });
