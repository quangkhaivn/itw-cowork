import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocBaoGia, LuocDoTaoBaoGia } from "@/modules/bao-gia/luoc-do";
import { danhSachBaoGia, taoBaoGia } from "@/modules/bao-gia/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachBaoGia(nc, docTruyVan(req, LuocDoLocBaoGia)), { quyen: "quotation.view" });

export const POST = xuLyApi(async (nc, req) => taoBaoGia(nc, await docThan(req, LuocDoTaoBaoGia)));
