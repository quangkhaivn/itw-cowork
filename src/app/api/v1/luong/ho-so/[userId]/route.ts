import { xuLyApi } from "@/lib/api";
import { lichSuHoSo } from "@/modules/luong/ho-so";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ userId: string }>(async (nc, _req, { userId }) => lichSuHoSo(nc, userId), { quyen: "luong.view" });
