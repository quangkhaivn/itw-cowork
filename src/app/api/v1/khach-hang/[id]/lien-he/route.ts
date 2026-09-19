import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoLienHe } from "@/modules/khach-hang/luoc-do";
import { taoLienHe } from "@/modules/khach-hang/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => taoLienHe(nc, id, await docThan(req, LuocDoLienHe)));
