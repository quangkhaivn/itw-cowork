import { docThan, xuLyApi } from "@/lib/api";
import { banGiao, LuocDoBanGiao, xemTruocBanGiao } from "@/modules/ban-giao/service";

export const dynamic = "force-dynamic";

/** Xem trước số việc sẽ chuyển — không ghi gì. */
export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => xemTruocBanGiao(nc, id), { quyen: "user.update" });

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => banGiao(nc, id, await docThan(req, LuocDoBanGiao)), { quyen: "user.update" });
