import { xuLyApi } from "@/lib/api";
import { chiTietTraHangMua } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietTraHangMua(nc, id));
