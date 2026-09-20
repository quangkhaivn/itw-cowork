import { xuLyApi } from "@/lib/api";
import { doiSoatKho } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

/** Đối soát: tổng sổ cái phải khớp số dư từng cặp (kho, sản phẩm). */
export const GET = xuLyApi((nc) => doiSoatKho(nc), { quyen: "inventory.view" });
