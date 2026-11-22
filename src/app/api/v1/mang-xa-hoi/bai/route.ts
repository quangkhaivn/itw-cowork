import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachBai, taoBai } from "@/modules/mang-xa-hoi/bai";
import { LuocDoBai, LuocDoLocBai } from "@/modules/mang-xa-hoi/luoc-do";

export const GET = xuLyApi((nc, req) => danhSachBai(nc, docTruyVan(req, LuocDoLocBai)), { quyen: "mxh.view" });

/** Tạo bài nháp. Tiêu đề `Idempotency-Key` (hoặc `khoaLapLai` trong thân) chống tạo trùng khi gửi lại (ADR-08). */
export const POST = xuLyApi(async (nc, req) => {
  const d = await docThan(req, LuocDoBai);
  const khoa = req.headers.get("idempotency-key")?.trim().slice(0, 100) || d.khoaLapLai || null;
  return taoBai(nc, { ...d, khoaLapLai: khoa });
}, { quyen: "mxh.create" });
