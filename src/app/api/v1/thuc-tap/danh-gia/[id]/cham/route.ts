import { docThan, xuLyApi } from "@/lib/api";
import { chamPhieuThucTap, LuocDoChamThucTap } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => chamPhieuThucTap(nc, id, await docThan(req, LuocDoChamThucTap)), { quyen: "danh_gia.view" });
