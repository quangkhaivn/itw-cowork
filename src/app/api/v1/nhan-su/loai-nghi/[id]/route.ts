import { docThan, xuLyApi } from "@/lib/api";
import { suaLoaiNghi } from "@/modules/nhan-su/service";
import { LuocDoLoaiNghi } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaLoaiNghi(nc, id, await docThan(req, LuocDoLoaiNghi)), { quyen: "nhan_su.update" });
