import { docThan, xuLyApi } from "@/lib/api";
import { suaDiaDiem } from "@/modules/nhan-su/service";
import { LuocDoDiaDiem } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaDiaDiem(nc, id, await docThan(req, LuocDoDiaDiem)), { quyen: "nhan_su.update" });
