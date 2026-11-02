import { xuLyApi } from "@/lib/api";
import { lamMoiSoLieu } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => lamMoiSoLieu(nc, id), { quyen: "danh_gia.view", hanGiaoDichMs: 60_000 });
