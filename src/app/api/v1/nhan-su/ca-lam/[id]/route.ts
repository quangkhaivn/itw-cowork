import { docThan, xuLyApi } from "@/lib/api";
import { suaCa } from "@/modules/nhan-su/service";
import { LuocDoCa } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaCa(nc, id, await docThan(req, LuocDoCa)), { quyen: "nhan_su.update" });
