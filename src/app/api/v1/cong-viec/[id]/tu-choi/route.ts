import { docThan, xuLyApi } from "@/lib/api";
import { tuChoiViec, LuocDoTuChoi } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** DG-03: từ chối kèm lý do — việc về người giao. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => tuChoiViec(nc, id, await docThan(req, LuocDoTuChoi)));
