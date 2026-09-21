import { xuLyApi } from "@/lib/api";
import { chiTietTraHangBan } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietTraHangBan(nc, id));
