import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaSanPham } from "@/modules/san-pham/luoc-do";
import { chiTietSanPham, suaSanPham } from "@/modules/san-pham/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietSanPham(nc, id), { quyen: "product.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaSanPham(nc, id, await docThan(req, LuocDoSuaSanPham)));
