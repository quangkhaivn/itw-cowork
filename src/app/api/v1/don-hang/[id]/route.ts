import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaDon } from "@/modules/don-hang/luoc-do";
import { chiTietDonHang, suaDonHang } from "@/modules/don-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietDonHang(nc, id), { quyen: "order.view" });

/** Sửa đơn còn nháp. Đơn đã xác nhận thì máy chủ từ chối (DH-03). */
export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaDonHang(nc, id, await docThan(req, LuocDoSuaDon)));
