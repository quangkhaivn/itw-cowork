import { docThan, xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { LuocDoHangLoat, thaoTacHangLoat } from "@/modules/khach-hang/hang-loat";

export const dynamic = "force-dynamic";

export const POST = xuLyApi(async (nc, req) => thaoTacHangLoat(nc, await docThan(req, LuocDoHangLoat)), { quyen: "customer.update", hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
