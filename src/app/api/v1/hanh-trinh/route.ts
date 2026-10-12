import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoTrangThaiHanhTrinh } from "@/modules/hanh-trinh/luoc-do";
import { danhSachTrangThaiHanhTrinh, taoTrangThaiHanhTrinh } from "@/modules/hanh-trinh/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachTrangThaiHanhTrinh(nc), { quyen: "customer.view" });

export const POST = xuLyApi(async (nc, req) => taoTrangThaiHanhTrinh(nc, await docThan(req, LuocDoTrangThaiHanhTrinh)), { quyen: "customer.approve" });
