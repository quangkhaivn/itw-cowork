import { docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocTheKho } from "@/modules/kho/luoc-do";
import { theKho } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

/** Thẻ kho: sổ cái chỉ-ghi-thêm của mọi lần nhập, xuất, giữ chỗ, điều chỉnh. */
export const GET = xuLyApi((nc, req) => theKho(nc, docTruyVan(req, LuocDoLocTheKho)), { quyen: "inventory.view" });
