import { xuLyApi } from "@/lib/api";
import { danhDauXongViec } from "@/modules/nhac-viec/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => danhDauXongViec(nc, id));
