import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaHangMuc } from "@/modules/du-an/luoc-do";
import { suaHangMuc, xoaHangMuc } from "@/modules/du-an/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string; hangMucId: string }>(async (nc, req, { id, hangMucId }) =>
  suaHangMuc(nc, id, hangMucId, await docThan(req, LuocDoSuaHangMuc)),
);

export const DELETE = xuLyApi<{ id: string; hangMucId: string }>((nc, _req, { id, hangMucId }) => xoaHangMuc(nc, id, hangMucId));
