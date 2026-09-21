import { xuLyApi } from "@/lib/api";
import { xinDuyetDeNghi } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => xinDuyetDeNghi(nc, id));
