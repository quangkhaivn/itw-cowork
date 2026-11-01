import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDongYWebhook } from "@/modules/marketing/luoc-do";
import { doiDongYWebhook } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

/** 0.18.0 — EG-08: trường / giá trị đồng ý nhận email quảng cáo của nguồn webhook. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => doiDongYWebhook(nc, id, await docThan(req, LuocDoDongYWebhook)), { quyen: "marketing.update" });
