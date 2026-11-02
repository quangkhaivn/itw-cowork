import { docThan, xuLyApi } from "@/lib/api";
import { traLaiViec, LuocDoTraLai } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** DG-23: trả lại kèm lý do — việc về Đang làm. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => traLaiViec(nc, id, await docThan(req, LuocDoTraLai)));
