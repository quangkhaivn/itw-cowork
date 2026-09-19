import { docThan, xuLyApi } from "@/lib/api";
import { ghiTuongTac, LuocDoGhiTuongTac } from "@/modules/tuong-tac/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi(async (nc, req) => ghiTuongTac(nc, await docThan(req, LuocDoGhiTuongTac)));
