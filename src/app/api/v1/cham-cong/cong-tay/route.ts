import type { NextRequest } from "next/server";
import { docThan, xuLyApi } from "@/lib/api";
import { danhSachCongTay, datCongTay } from "@/modules/cham-cong/cong-tay";
import { LuocDoDatCongTay } from "@/modules/cham-cong/luoc-do";
import { homNayVN } from "@/modules/crm/chung";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-174): công đặt tay của tháng (?nam=&thang=). */
export const GET = xuLyApi((nc, req: NextRequest) => {
  const nam = Number(req.nextUrl.searchParams.get("nam"));
  const thang = Number(req.nextUrl.searchParams.get("thang"));
  const hn = homNayVN();
  return danhSachCongTay(nc, Number.isInteger(nam) && nam >= 2020 ? nam : Number(hn.slice(0, 4)), Number.isInteger(thang) && thang >= 1 && thang <= 12 ? thang : Number(hn.slice(5, 7)));
});
export const POST = xuLyApi(async (nc, req) => datCongTay(nc, await docThan(req, LuocDoDatCongTay)), { quyen: "cham_cong.update" });
