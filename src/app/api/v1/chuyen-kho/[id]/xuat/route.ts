import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXuatChuyenKho } from "@/modules/chuyen-kho/luoc-do";
import { xuatChuyenKho } from "@/modules/chuyen-kho/service";

export const dynamic = "force-dynamic";

/** Xuất: hàng thật sự rời kho nguồn, sê-ri chuyển sang "đang chuyển" (CK-03, CK-05). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  xuatChuyenKho(nc, id, await docThan(req, LuocDoXuatChuyenKho)),
);
