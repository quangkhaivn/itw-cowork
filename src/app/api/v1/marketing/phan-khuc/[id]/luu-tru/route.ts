import { xuLyApi } from "@/lib/api";
import { luuTruPhanKhuc } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => luuTruPhanKhuc(nc, id), { quyen: "marketing.update" });
