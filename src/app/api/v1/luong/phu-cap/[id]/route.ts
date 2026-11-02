import { docThan, xuLyApi } from "@/lib/api";
import { suaLoaiPhuCap } from "@/modules/luong/ho-so";
import { LuocDoLoaiPhuCap } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaLoaiPhuCap(nc, id, await docThan(req, LuocDoLoaiPhuCap)), { quyen: "luong.update" });
