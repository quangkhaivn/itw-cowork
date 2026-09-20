import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHangMuc } from "@/modules/du-an/luoc-do";
import { themHangMuc } from "@/modules/du-an/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => themHangMuc(nc, id, await docThan(req, LuocDoHangMuc)));
