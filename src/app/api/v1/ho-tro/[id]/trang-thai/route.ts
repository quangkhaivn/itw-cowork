import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDoiTrangThai } from "@/modules/ho-tro/luoc-do";
import { doiTrangThaiPhieu } from "@/modules/ho-tro/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => doiTrangThaiPhieu(nc, id, await docThan(req, LuocDoDoiTrangThai)));
