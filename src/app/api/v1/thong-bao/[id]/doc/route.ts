import { xuLyApi } from "@/lib/api";
import { danhDauDaDoc } from "@/modules/thong-bao/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => danhDauDaDoc(nc, id));
