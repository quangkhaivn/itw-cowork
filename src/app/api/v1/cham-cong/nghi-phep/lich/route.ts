import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { lichNghiThang } from "@/modules/nghi-phep/service";

export const dynamic = "force-dynamic";

const Loc = z.object({ nam: z.coerce.number().int().min(2020).max(2100), thang: z.coerce.number().int().min(1).max(12) });

export const GET = xuLyApi((nc, req) => {
  const l = docTruyVan(req, Loc);
  return lichNghiThang(nc, l.nam, l.thang);
}, { quyen: "cham_cong.view" });
