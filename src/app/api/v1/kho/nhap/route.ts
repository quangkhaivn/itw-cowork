import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhapKho } from "@/modules/kho/luoc-do";
import { nhapKho } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi(async (nc, req) => nhapKho(nc, await docThan(req, LuocDoNhapKho)));
