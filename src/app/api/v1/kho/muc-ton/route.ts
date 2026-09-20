import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoMucTonToiThieu } from "@/modules/kho/luoc-do";
import { datMucTonToiThieu } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi(async (nc, req) => {
  const d = await docThan(req, LuocDoMucTonToiThieu);
  return datMucTonToiThieu(nc, d.sanPhamId, d.mucToiThieu ?? null);
});
