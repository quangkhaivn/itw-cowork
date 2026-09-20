import { docThan, xuLyApi } from "@/lib/api";
import { chiTietNhaCungCap, LuocDoSuaNhaCungCap, suaNhaCungCap } from "@/modules/nha-cung-cap/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietNhaCungCap(nc, id), { quyen: "supplier.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaNhaCungCap(nc, id, await docThan(req, LuocDoSuaNhaCungCap)));
