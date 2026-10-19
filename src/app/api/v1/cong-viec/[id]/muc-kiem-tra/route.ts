import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoThemMuc, themMucKiemTra } from "@/modules/cong-viec/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => themMucKiemTra(nc, id, await docThan(req, LuocDoThemMuc)));
