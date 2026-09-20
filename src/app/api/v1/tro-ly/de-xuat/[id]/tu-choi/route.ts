import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoTuChoiDeXuat } from "@/modules/tro-ly/luoc-do";
import { tuChoiDeXuat } from "@/modules/tro-ly/de-xuat";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => tuChoiDeXuat(nc, id, (await docThan(req, LuocDoTuChoiDeXuat)).lyDo));
