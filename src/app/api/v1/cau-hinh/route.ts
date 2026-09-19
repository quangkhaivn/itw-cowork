import { docThan, xuLyApi } from "@/lib/api";
import { capNhatCauHinh, LuocDoCapNhatCauHinh, tatCaCauHinh } from "@/modules/cau-hinh/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => tatCaCauHinh(nc));

export const PATCH = xuLyApi(async (nc, req) => capNhatCauHinh(nc, await docThan(req, LuocDoCapNhatCauHinh)));
