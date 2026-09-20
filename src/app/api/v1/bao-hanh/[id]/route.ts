import { docThan, xuLyApi } from "@/lib/api";
import { chiTietBaoHanh, LuocDoSuaBaoHanh, suaBaoHanh } from "@/modules/bao-hanh/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietBaoHanh(nc, id), { quyen: "service_desk.view" });

/** Sửa thời hạn bảo hành — luôn phải ghi lý do (BH-04). */
export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaBaoHanh(nc, id, await docThan(req, LuocDoSuaBaoHanh)));
