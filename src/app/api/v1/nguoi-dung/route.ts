import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocNguoiDung, LuocDoTaoNguoiDung } from "@/modules/nguoi-dung/luoc-do";
import { danhSachNguoiDung, taoNguoiDung } from "@/modules/nguoi-dung/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachNguoiDung(nc, docTruyVan(req, LuocDoLocNguoiDung)));

export const POST = xuLyApi(async (nc, req) => taoNguoiDung(nc, await docThan(req, LuocDoTaoNguoiDung)));
