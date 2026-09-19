import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaKhachHang } from "@/modules/khach-hang/luoc-do";
import { khach360, suaKhachHang } from "@/modules/khach-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => khach360(nc, id), { quyen: "customer.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaKhachHang(nc, id, await docThan(req, LuocDoSuaKhachHang)));
