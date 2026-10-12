import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoMa, taoLaiMaKhoiPhuc } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

/** Sinh lại 10 mã khôi phục (mã cũ hết hiệu lực). Cần một mã đúng. */
export const POST = xuLyApi(async (nc, req) => taoLaiMaKhoiPhuc(nc, (await docThan(req, LuocDoMa)).ma));
