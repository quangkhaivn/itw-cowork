import { xuLyApi } from "@/lib/api";
import { diemCuaKhach } from "@/modules/cham-diem/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => diemCuaKhach(nc, id), { quyen: "customer.view" });
