import { xuLyApi } from "@/lib/api";
import { nhanViec } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** DG-03: người được giao bấm Nhận. */
export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => nhanViec(nc, id));
