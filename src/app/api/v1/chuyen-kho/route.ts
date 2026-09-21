import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocChuyenKho, LuocDoTaoChuyenKho } from "@/modules/chuyen-kho/luoc-do";
import { danhSachChuyenKho, taoChuyenKho } from "@/modules/chuyen-kho/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachChuyenKho(nc, docTruyVan(req, LuocDoLocChuyenKho)), {
  quyen: "inventory.view",
});

/** Lập phiếu chuyển kho (CK-01). Lập xong ở trạng thái Nháp, hàng chưa đi. */
export const POST = xuLyApi(async (nc, req) => taoChuyenKho(nc, await docThan(req, LuocDoTaoChuyenKho)));
