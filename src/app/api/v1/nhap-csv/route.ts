import { docThan, xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { LuocDoNhapCsv } from "@/modules/san-pham/luoc-do";
import { nhapCsv } from "@/modules/san-pham/nhap-xuat";

export const dynamic = "force-dynamic";

/** Nhập CSV. `ghiThat: false` = xem trước, không ghi gì. */
export const POST = xuLyApi(async (nc, req) => nhapCsv(nc, await docThan(req, LuocDoNhapCsv)), { hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
