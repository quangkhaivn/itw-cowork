import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { goiYSanPham } from "@/modules/bao-gia/service";

export const dynamic = "force-dynamic";

const LuocDo = z.object({ q: z.string().trim().max(100).optional().default("") });

/** Gợi ý hàng để thêm vào báo giá: giá bán, VAT và giá vốn theo nguồn nên mua. */
export const GET = xuLyApi((nc, req) => goiYSanPham(nc, docTruyVan(req, LuocDo).q));
