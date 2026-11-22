import { docThan, xuLyApi } from "@/lib/api";
import { ngatKenh, suaKenh } from "@/modules/mang-xa-hoi/kenh";
import { LuocDoSuaKenh } from "@/modules/mang-xa-hoi/luoc-do";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaKenh(nc, id, await docThan(req, LuocDoSuaKenh)), { quyen: "mxh.update" });

/** Ngắt kênh: hủy bản niêm phong, hủy lượt đăng chưa chạy. */
export const DELETE = xuLyApi<{ id: string }>((nc, _req, { id }) => ngatKenh(nc, id), { quyen: "mxh.delete" });
