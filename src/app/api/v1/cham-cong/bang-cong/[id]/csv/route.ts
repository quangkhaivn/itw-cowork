import { NextResponse } from "next/server";
import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { xuatCsvBangCong } from "@/modules/cham-cong/bang-cong";

export const dynamic = "force-dynamic";

const Loc = z.object({ kieu: z.enum(["tong-hop", "chi-tiet"]).default("tong-hop") });

/** GET — tải CSV bảng công cho tính lương / kế toán (NS-54). */
export const GET = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const kq = await xuatCsvBangCong(nc, id, docTruyVan(req, Loc).kieu);
  return new NextResponse(kq.noiDung, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kq.ten}"`,
      "Cache-Control": "no-store",
    },
  });
}, { quyen: "cham_cong.export" });
