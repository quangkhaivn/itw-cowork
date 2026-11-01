import { xuLyApi } from "@/lib/api";
import { danhSachHoSoNhanSu } from "@/modules/nhan-su/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => {
  const sp = req.nextUrl.searchParams;
  return danhSachHoSoNhanSu(nc, { q: sp.get("q")?.slice(0, 100) ?? "", loai: sp.get("loai") ?? "", phongBanId: sp.get("phongBanId") ?? "" });
}, { quyen: "nhan_su.view" });
