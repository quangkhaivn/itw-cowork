import { xuLyApi } from "@/lib/api";
import { taoPhienBanMoi } from "@/modules/bao-gia/service";

export const dynamic = "force-dynamic";

/** Tạo phiên bản mới từ bản hiện hành (QT-2026-0001-V2). */
export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => taoPhienBanMoi(nc, id));
