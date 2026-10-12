import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhomKhach } from "@/modules/nhom-khach/luoc-do";
import { danhSachNhomKhach, taoNhomKhach } from "@/modules/nhom-khach/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachNhomKhach(nc), { quyen: "customer.view" });

export const POST = xuLyApi(async (nc, req) => taoNhomKhach(nc, await docThan(req, LuocDoNhomKhach)), { quyen: "customer.approve" });
