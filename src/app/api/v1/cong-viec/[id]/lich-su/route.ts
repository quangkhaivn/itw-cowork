import { xuLyApi } from "@/lib/api";
import { lichSuGiaoViec } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>(async (nc, _req, { id }) => lichSuGiaoViec(nc, id));
