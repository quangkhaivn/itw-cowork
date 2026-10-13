import { docThan, xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { LuocDoNhapKhachCsv, nhapKhachCsv } from "@/modules/khach-hang/nhap-xuat";

export const dynamic = "force-dynamic";

/** Nhập CSV khách hàng. `ghiThat: false` = xem trước (chạy thử từng dòng rồi cuộn ngược). */
export const POST = xuLyApi(async (nc, req) => nhapKhachCsv(nc, await docThan(req, LuocDoNhapKhachCsv)), { quyen: "customer.create", hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
