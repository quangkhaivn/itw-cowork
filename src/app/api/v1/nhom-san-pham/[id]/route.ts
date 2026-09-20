import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaNhom, suaNhom } from "@/modules/danh-muc-san-pham/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaNhom(nc, id, await docThan(req, LuocDoSuaNhom)));
