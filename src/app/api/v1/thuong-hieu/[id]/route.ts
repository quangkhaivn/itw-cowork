import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaThuongHieu, suaThuongHieu } from "@/modules/danh-muc-san-pham/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaThuongHieu(nc, id, await docThan(req, LuocDoSuaThuongHieu)));
