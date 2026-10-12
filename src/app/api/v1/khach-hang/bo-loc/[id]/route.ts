import { xuLyApi } from "@/lib/api";
import { goBoLoc } from "@/modules/khach-hang/bo-loc";

export const dynamic = "force-dynamic";

export const DELETE = xuLyApi<{ id: string }>((nc, _req, { id }) => goBoLoc(nc, id), { quyen: "customer.view" });
