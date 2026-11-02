import { docThan, xuLyApi } from "@/lib/api";
import { duyetViec, LuocDoDuyetViec } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** DG-23: duyệt cấp hiện tại + chấm chất lượng 1–5. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => duyetViec(nc, id, await docThan(req, LuocDoDuyetViec)));
