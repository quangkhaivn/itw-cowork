import { xuLyApi } from "@/lib/api";
import { xacNhanDonMua } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => xacNhanDonMua(nc, id));
