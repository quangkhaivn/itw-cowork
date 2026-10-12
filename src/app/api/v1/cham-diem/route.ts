import { z } from "zod";
import { docThan, xuLyApi } from "@/lib/api";
import { luuDiemNguon, xemCauHinhDiem } from "@/modules/cham-diem/service";

export const dynamic = "force-dynamic";

const LuocDoDiemNguon = z.object({ diemNguon: z.record(z.string().max(50), z.number().int().min(0).max(100).nullable()) });

export const GET = xuLyApi((nc) => xemCauHinhDiem(nc), { quyen: "customer.view" });

export const PUT = xuLyApi(async (nc, req) => luuDiemNguon(nc, (await docThan(req, LuocDoDiemNguon)).diemNguon), { quyen: "setting.update" });
