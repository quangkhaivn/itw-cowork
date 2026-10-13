import { z } from "zod";
import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { gopKhach, LuocDoGopKhach, xemTruocGop } from "@/modules/khach-hang/gop";

export const dynamic = "force-dynamic";

const LuocDoXemTruoc = z.object({ giuLaiId: z.uuid(), biGopId: z.uuid() });

/** Xem trước: đếm bản ghi sẽ chuyển ở từng bảng — không ghi gì. */
export const GET = xuLyApi((nc, req) => {
  const d = docTruyVan(req, LuocDoXemTruoc);
  return xemTruocGop(nc, d.giuLaiId, d.biGopId);
}, { quyen: "customer.approve" });

export const POST = xuLyApi(async (nc, req) => gopKhach(nc, await docThan(req, LuocDoGopKhach)), { quyen: "customer.approve" });
