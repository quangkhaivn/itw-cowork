import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { xuatBangLuong, xuatButToan, xuatNganHang } from "@/modules/luong/xuat";

export const dynamic = "force-dynamic";

const Loc = z.object({ loai: z.enum(["bang-luong", "ngan-hang", "but-toan"]), dinhDang: z.enum(["csv", "xls"]).optional() });

/** GET — tải bảng lương Excel / file chi lương ngân hàng / bút toán lương (LU-50 → LU-53). */
export const GET = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const q = docTruyVan(req, Loc);
  if (q.loai === "bang-luong") return xuatBangLuong(nc, id, q.dinhDang ?? "xls");
  if (q.loai === "ngan-hang") return xuatNganHang(nc, id, q.dinhDang ?? "xls");
  return xuatButToan(nc, id);
}, { quyen: "luong.export" });
