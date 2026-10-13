import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoForm } from "@/modules/marketing/luoc-do";
import { chiTietForm, suaForm } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietForm(nc, id), { quyen: "marketing.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaForm(nc, id, await docThan(req, LuocDoForm)), { quyen: "marketing.update" });
