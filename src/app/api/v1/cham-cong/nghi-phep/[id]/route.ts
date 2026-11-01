import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoQuyetDinhNghi } from "@/modules/nghi-phep/luoc-do";
import { quyetDinhNghi } from "@/modules/nghi-phep/service";

export const dynamic = "force-dynamic";

/** POST { hanhDong: duyet | tu-choi | huy, ghiChu } — khóa đơn rồi khóa quỹ phép (NS-34). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => quyetDinhNghi(nc, id, await docThan(req, LuocDoQuyetDinhNghi)));
