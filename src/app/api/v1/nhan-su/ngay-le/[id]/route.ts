import { docThan, xuLyApi } from "@/lib/api";
import { doiTrangThaiNgayLe } from "@/modules/nhan-su/service";
import { LuocDoSuaNgayLe } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => doiTrangThaiNgayLe(nc, id, (await docThan(req, LuocDoSuaNgayLe)).trangThai), { quyen: "nhan_su.update" });
