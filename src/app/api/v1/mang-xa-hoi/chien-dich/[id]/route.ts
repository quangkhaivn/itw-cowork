import { docThan, xuLyApi } from "@/lib/api";
import { suaChienDich } from "@/modules/mang-xa-hoi/chien-dich";
import { LuocDoChienDich } from "@/modules/mang-xa-hoi/luoc-do";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaChienDich(nc, id, await docThan(req, LuocDoChienDich)), { quyen: "mxh.update" });
