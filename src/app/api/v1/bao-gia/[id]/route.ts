import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaPhienBan } from "@/modules/bao-gia/luoc-do";
import { chiTietBaoGia, suaPhienBan } from "@/modules/bao-gia/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietBaoGia(nc, id), { quyen: "quotation.view" });

/** Sửa phiên bản đang soạn. Bản đã gửi thì phải tạo phiên bản mới (BG-02). */
export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaPhienBan(nc, id, await docThan(req, LuocDoSuaPhienBan)));
