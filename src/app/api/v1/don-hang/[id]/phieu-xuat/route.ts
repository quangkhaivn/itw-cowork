import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoTaoPhieuXuat } from "@/modules/don-hang/luoc-do";
import { taoPhieuXuat } from "@/modules/don-hang/service";

export const dynamic = "force-dynamic";

/** Lập phiếu xuất: trừ tồn, nhả giữ chỗ, cộng số đã giao, tự đặt lại trạng thái đơn (DH-05). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => taoPhieuXuat(nc, id, await docThan(req, LuocDoTaoPhieuXuat)));
