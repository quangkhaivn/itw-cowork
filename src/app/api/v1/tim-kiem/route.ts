import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { timKiemToanCuc } from "@/modules/tim-kiem/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi(async (nc, req) => {
  const { q } = docTruyVan(req, z.object({ q: z.string().max(200).default("") }));
  return { ketQua: await timKiemToanCuc(nc, q) };
});
