import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoMau } from "@/modules/email/luoc-do";
import { chiTietMau, suaMau } from "@/modules/email/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietMau(nc, id), { quyen: "marketing.view" });
export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaMau(nc, id, await docThan(req, LuocDoMau)), { quyen: "marketing.update" });
