import { xuLyApi } from "@/lib/api";
import { chiTietBaoCao } from "@/modules/bao-cao-cong-viec/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietBaoCao(nc, id), { quyen: "danh_gia.view" });
