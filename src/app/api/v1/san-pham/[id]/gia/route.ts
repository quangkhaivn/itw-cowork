import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDatGiaNguon } from "@/modules/san-pham/luoc-do";
import { datGiaNguon } from "@/modules/san-pham/service";

export const dynamic = "force-dynamic";

/** Đặt hoặc cập nhật giá của một nhà cung cấp cho sản phẩm này. Giá cũ vào lịch sử giá. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => datGiaNguon(nc, id, await docThan(req, LuocDoDatGiaNguon)));
