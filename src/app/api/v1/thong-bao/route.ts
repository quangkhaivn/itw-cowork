import { xuLyApi } from "@/lib/api";
import { danhSachThongBao } from "@/modules/thong-bao/service";

export const dynamic = "force-dynamic";

/** Chuông trên thanh trên. Luôn chỉ trả thông báo của CHÍNH người đang đăng nhập. */
export const GET = xuLyApi((nc, req) => {
  const sp = new URL(req.url).searchParams;
  return danhSachThongBao(nc, sp.get("chuaDoc") === "1", Number(sp.get("coTrang") ?? 20));
});
