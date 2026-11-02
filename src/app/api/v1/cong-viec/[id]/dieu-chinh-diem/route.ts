import { docThan, xuLyApi } from "@/lib/api";
import { dieuChinhDiem, LuocDoDieuChinhDiem } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** DG-32: điều chỉnh điểm có lý do (chỉ ghi thêm). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => dieuChinhDiem(nc, id, await docThan(req, LuocDoDieuChinhDiem)));
