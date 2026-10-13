import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaNhomKhach } from "@/modules/nhom-khach/luoc-do";
import { suaNhomKhach } from "@/modules/nhom-khach/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaNhomKhach(nc, id, await docThan(req, LuocDoSuaNhomKhach)), { quyen: "customer.approve" });
