import { docThan, xuLyApi } from "@/lib/api";
import { danhSachMauViec, LuocDoMauViec, taoMauViec } from "@/modules/cong-viec/mau-lap";

export const dynamic = "force-dynamic";

/** DG-06: mẫu việc. `?caNgung=1` gồm cả mẫu ngừng dùng. */
export const GET = xuLyApi((nc, req) => danhSachMauViec(nc, req.nextUrl.searchParams.get("caNgung") === "1"), { quyen: "task.view" });
export const POST = xuLyApi(async (nc, req) => taoMauViec(nc, await docThan(req, LuocDoMauViec)));
