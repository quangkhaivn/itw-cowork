import { xuLyApi } from "@/lib/api";
import { dongHoiThoai } from "@/modules/tro-ly/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => dongHoiThoai(nc, id));
