import { docThan, xuLyApi } from "@/lib/api";
import { danhSachDiaDiem, taoDiaDiem } from "@/modules/nhan-su/service";
import { LuocDoDiaDiem } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachDiaDiem(nc), {});
export const POST = xuLyApi(async (nc, req) => taoDiaDiem(nc, await docThan(req, LuocDoDiaDiem)), { quyen: "nhan_su.create" });
