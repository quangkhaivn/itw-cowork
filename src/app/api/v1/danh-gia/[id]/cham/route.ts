import { docThan, xuLyApi } from "@/lib/api";
import { quanLyCham, LuocDoQuanLyCham } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => quanLyCham(nc, id, await docThan(req, LuocDoQuanLyCham)), { quyen: "danh_gia.view" });
