import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXepThuTu } from "@/modules/hanh-trinh/luoc-do";
import { xepThuTuTrangThai } from "@/modules/hanh-trinh/service";

export const dynamic = "force-dynamic";

/** Lưu thứ tự sau khi kéo thả / bấm lên-xuống trên trang Hành trình. */
export const POST = xuLyApi(async (nc, req) => xepThuTuTrangThai(nc, (await docThan(req, LuocDoXepThuTu)).ids), { quyen: "customer.approve" });
