import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaMuc, suaMuc } from "@/modules/du-lieu-goc/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  suaMuc(nc, id, await docThan(req, LuocDoSuaMuc)),
);
