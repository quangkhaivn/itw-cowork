import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoLuuPhanKhuc } from "@/modules/marketing/luoc-do";
import { chiTietPhanKhuc, luuPhanKhuc } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietPhanKhuc(nc, id), { quyen: "marketing.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => luuPhanKhuc(nc, id, await docThan(req, LuocDoLuuPhanKhuc)), { quyen: "marketing.update" });
