import { docThan, xuLyApi } from "@/lib/api";
import { danhSachVaiTro, LuocDoTaoVaiTro, taoVaiTro } from "@/modules/vai-tro/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachVaiTro(nc));

export const POST = xuLyApi(async (nc, req) => taoVaiTro(nc, await docThan(req, LuocDoTaoVaiTro)));
