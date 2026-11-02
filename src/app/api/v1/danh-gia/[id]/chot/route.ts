import { docThan, xuLyApi } from "@/lib/api";
import { chotPhieu, LuocDoChot } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => chotPhieu(nc, id, await docThan(req, LuocDoChot)), { quyen: "danh_gia.view" });
