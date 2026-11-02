import { docThan, xuLyApi } from "@/lib/api";
import { danhSachLapViec, LuocDoLapViec, taoLapViec } from "@/modules/cong-viec/mau-lap";

export const dynamic = "force-dynamic";

/** DG-07: việc định kỳ — worker sinh việc mỗi ngày lặp. */
export const GET = xuLyApi((nc) => danhSachLapViec(nc), { quyen: "task.view" });
export const POST = xuLyApi(async (nc, req) => taoLapViec(nc, await docThan(req, LuocDoLapViec)));
