import { xuLyApi } from "@/lib/api";
import { danhSachPhieu } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => danhSachPhieu(nc, id), { quyen: "danh_gia.view" });
