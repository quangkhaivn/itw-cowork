import { xuLyApi } from "@/lib/api";
import { guiDonMua } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => guiDonMua(nc, id));
