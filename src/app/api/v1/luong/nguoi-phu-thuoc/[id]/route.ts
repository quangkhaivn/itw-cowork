import { docThan, xuLyApi } from "@/lib/api";
import { ketThucNguoiPhuThuoc, suaNguoiPhuThuoc } from "@/modules/luong/ho-so";
import { LuocDoKetThucNguoiPhuThuoc, LuocDoSuaNguoiPhuThuoc } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

/** PATCH — kết thúc giảm trừ từ sau tháng chọn (không xóa). */
export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => ketThucNguoiPhuThuoc(nc, id, await docThan(req, LuocDoKetThucNguoiPhuThuoc)), { quyen: "luong.update" });
/** PUT — 0.22.0 (QĐ-182): bổ sung họ tên / quan hệ / MST hoặc số giấy tờ (người "chưa ghi tên" được giảm trừ khi đủ). */
export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaNguoiPhuThuoc(nc, id, await docThan(req, LuocDoSuaNguoiPhuThuoc)), { quyen: "luong.update" });
