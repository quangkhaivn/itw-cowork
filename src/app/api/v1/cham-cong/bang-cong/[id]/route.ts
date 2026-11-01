import { z } from "zod";
import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { chiTietBangCong, khoaBangCong } from "@/modules/cham-cong/bang-cong";

export const dynamic = "force-dynamic";

const Loc = z.object({ nguoiId: z.union([z.uuid(), z.literal("")]).optional().transform((x) => x || null) });

export const GET = xuLyApi<{ id: string }>((nc, req, { id }) => chiTietBangCong(nc, id, docTruyVan(req, Loc).nguoiId), { quyen: "cham_cong.view" });
/** POST { hanhDong: "khoa" } — khóa bảng công (NS-52). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  await docThan(req, z.object({ hanhDong: z.literal("khoa") }));
  return khoaBangCong(nc, id);
}, { quyen: "cham_cong.update" });
