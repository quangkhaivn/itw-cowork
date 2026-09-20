import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoBatTatQuyTac } from "@/modules/nhac-viec/luoc-do";
import { batTatQuyTac } from "@/modules/nhac-viec/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ ma: string }>(async (nc, req, { ma }) => batTatQuyTac(nc, ma, (await docThan(req, LuocDoBatTatQuyTac)).bat));
