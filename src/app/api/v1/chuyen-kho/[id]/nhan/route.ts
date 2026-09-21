import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhanChuyenKho } from "@/modules/chuyen-kho/luoc-do";
import { nhanChuyenKho } from "@/modules/chuyen-kho/service";

export const dynamic = "force-dynamic";

/** Nhận: hàng vào kho đích. Nhận thiếu thì bắt buộc ghi lý do (CK-04). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  nhanChuyenKho(nc, id, await docThan(req, LuocDoNhanChuyenKho)),
);
