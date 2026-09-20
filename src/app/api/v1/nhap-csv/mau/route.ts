import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { mauCsv } from "@/modules/san-pham/nhap-xuat";

export const dynamic = "force-dynamic";

const LuocDo = z.object({ loai: z.enum(["san-pham", "gia-nha-cung-cap"]).optional().default("san-pham") });

/** Tệp mẫu (trả nội dung để trình duyệt tự tải về) — giữ mọi phản hồi đi qua lớp bọc chung. */
export const GET = xuLyApi((nc, req) => {
  const { loai } = docTruyVan(req, LuocDo);
  return Promise.resolve({ tenTep: `mau-${loai}.csv`, noiDung: mauCsv(loai) });
}, { quyen: "product.view" });
