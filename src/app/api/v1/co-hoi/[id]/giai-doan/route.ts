import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDoiGiaiDoan } from "@/modules/co-hoi/luoc-do";
import { doiGiaiDoan } from "@/modules/co-hoi/service";

export const dynamic = "force-dynamic";

/** Đường duy nhất để đổi giai đoạn, đóng (Thắng/Thua) hoặc mở lại cơ hội. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => doiGiaiDoan(nc, id, await docThan(req, LuocDoDoiGiaiDoan)));
