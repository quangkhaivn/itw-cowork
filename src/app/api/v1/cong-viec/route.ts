import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachViec, LuocDoLocViec, LuocDoTaoViec, taoViec } from "@/modules/cong-viec/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachViec(nc, docTruyVan(req, LuocDoLocViec)), { quyen: "task.view" });

export const POST = xuLyApi(async (nc, req) => taoViec(nc, await docThan(req, LuocDoTaoViec)));
