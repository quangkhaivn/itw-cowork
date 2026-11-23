import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoTrangCongKhai } from "@/modules/mang-xa-hoi/luoc-do";
import { suaTrang } from "@/modules/mang-xa-hoi/trang-cong-khai";

/** Sửa trang công khai (Điều khoản / Quyền riêng tư / Xóa dữ liệu) — Giám đốc / Quản trị. */
export const PUT = xuLyApi<{ trang: string }>(async (nc, req, { trang }) => suaTrang(nc, trang, await docThan(req, LuocDoTrangCongKhai)), { quyen: "setting.update" });
