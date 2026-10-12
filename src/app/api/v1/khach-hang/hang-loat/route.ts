import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHangLoat, thaoTacHangLoat } from "@/modules/khach-hang/hang-loat";

export const dynamic = "force-dynamic";

export const POST = xuLyApi(async (nc, req) => thaoTacHangLoat(nc, await docThan(req, LuocDoHangLoat)), { quyen: "customer.update" });
