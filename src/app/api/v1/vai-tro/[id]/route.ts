import { docThan, xuLyApi } from "@/lib/api";
import { chiTietVaiTro, LuocDoSuaVaiTro, suaVaiTro } from "@/modules/vai-tro/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietVaiTro(nc, id));

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  suaVaiTro(nc, id, await docThan(req, LuocDoSuaVaiTro)),
);
