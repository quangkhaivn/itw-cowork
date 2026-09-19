import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaNguoiDung } from "@/modules/nguoi-dung/luoc-do";
import { chiTietNguoiDung, suaNguoiDung } from "@/modules/nguoi-dung/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietNguoiDung(nc, id));

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  suaNguoiDung(nc, id, await docThan(req, LuocDoSuaNguoiDung)),
);
