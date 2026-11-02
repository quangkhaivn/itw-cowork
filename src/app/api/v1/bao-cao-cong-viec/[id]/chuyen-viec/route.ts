import { docThan, xuLyApi } from "@/lib/api";
import { chuyenVuongMacThanhViec, LuocDoChuyenViec } from "@/modules/bao-cao-cong-viec/service";

export const dynamic = "force-dynamic";

/** DG-44: chuyển vướng mắc thành việc mới bằng một nút. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => chuyenVuongMacThanhViec(nc, id, await docThan(req, LuocDoChuyenViec)));
