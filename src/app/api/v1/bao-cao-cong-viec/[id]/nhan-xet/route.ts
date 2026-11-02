import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhanXet, nhanXetBaoCao } from "@/modules/bao-cao-cong-viec/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => nhanXetBaoCao(nc, id, await docThan(req, LuocDoNhanXet)));
