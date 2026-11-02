import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoMauPhieuLuu, suaMauPhieu } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaMauPhieu(nc, id, await docThan(req, LuocDoMauPhieuLuu)), { quyen: "nhan_su.update" });
