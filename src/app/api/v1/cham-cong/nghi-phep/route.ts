import { z } from "zod";
import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoDonNghi } from "@/modules/nghi-phep/luoc-do";
import { danhSachDonNghi, taoDonNghi } from "@/modules/nghi-phep/service";

export const dynamic = "force-dynamic";

const Loc = z.object({
  loai: z.enum(["cua-toi", "cho-toi-duyet", "tat-ca"]).default("cua-toi"),
  trangThai: z.enum(["", "cho-duyet", "da-duyet", "tu-choi", "da-huy"]).default(""),
});

export const GET = xuLyApi((nc, req) => {
  const l = docTruyVan(req, Loc);
  return danhSachDonNghi(nc, l.loai, l.trangThai);
}, { quyen: "cham_cong.view" });
export const POST = xuLyApi(async (nc, req) => taoDonNghi(nc, await docThan(req, LuocDoDonNghi)), { quyen: "cham_cong.create" });
