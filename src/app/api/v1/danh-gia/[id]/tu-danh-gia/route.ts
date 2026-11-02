import { docThan, xuLyApi } from "@/lib/api";
import { tuDanhGia, LuocDoTuDanhGia } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => tuDanhGia(nc, id, await docThan(req, LuocDoTuDanhGia)), { quyen: "danh_gia.view" });
