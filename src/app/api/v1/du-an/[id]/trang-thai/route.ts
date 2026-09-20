import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDoiTrangThaiDuAn } from "@/modules/du-an/luoc-do";
import { doiTrangThaiDuAn } from "@/modules/du-an/service";

export const dynamic = "force-dynamic";

/** Chạy, tạm dừng, nghiệm thu, hủy. Nghiệm thu chỉ được khi mọi hạng mục đã xong (DU-05). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => doiTrangThaiDuAn(nc, id, await docThan(req, LuocDoDoiTrangThaiDuAn)));
