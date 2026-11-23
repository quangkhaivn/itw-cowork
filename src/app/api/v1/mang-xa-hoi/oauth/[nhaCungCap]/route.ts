import { docThan, LoiChuaDangNhap, xuLyApi } from "@/lib/api";
import { layPhienHienTai } from "@/lib/xac-thuc";
import { LuocDoBatDauOAuth } from "@/modules/mang-xa-hoi/luoc-do";
import { batDauOAuth, manHinhDongY } from "@/modules/mang-xa-hoi/oauth";
import { maPhien } from "@/modules/mang-xa-hoi/oauth-thuan";

/** Màn hình đồng ý của Cowork (quyền xin, nền tảng) — GET; bắt đầu OAuth (state một lần, 10 phút, gắn phiên) — POST. */
export const GET = xuLyApi<{ nhaCungCap: string }>(async (nc, req, { nhaCungCap }) => manHinhDongY(nc, nhaCungCap, req.nextUrl.searchParams.get("kenh")), { quyen: "mxh.update" });

export const POST = xuLyApi<{ nhaCungCap: string }>(async (nc, req, { nhaCungCap }) => {
  const p = await layPhienHienTai();
  if (!p) throw new LoiChuaDangNhap();
  return batDauOAuth(nc, nhaCungCap, await docThan(req, LuocDoBatDauOAuth), maPhien(p.userId, p.tenantId, p.kyLucMs));
}, { quyen: "mxh.update" });
