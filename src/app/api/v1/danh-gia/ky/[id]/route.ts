import { docThan, xuLyApi } from "@/lib/api";
import { danhSachPhieu, LuocDoSuaKy, suaKyDanhGia } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => danhSachPhieu(nc, id), { quyen: "danh_gia.view" });

/** QĐ-140: sửa loại kỳ / năm / số kỳ — kỳ đã có phiếu chốt trả 409 `ky-da-chot`. */
export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaKyDanhGia(nc, id, await docThan(req, LuocDoSuaKy)), { quyen: "nhan_su.update" });
