import { NextRequest } from "next/server";
import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoBaoCao, luuBaoCao, moBaoCao } from "@/modules/bao-cao-cong-viec/service";

export const dynamic = "force-dynamic";

function loai(req: NextRequest) {
  return req.nextUrl.searchParams.get("loai") === "ngay" ? "ngay" : "tuan";
}

/** DG-40: báo cáo kỳ hiện tại (hoặc kỳ chứa `?ngay=`) của chính mình — bản đã lưu hoặc bản điền sẵn. */
export const GET = xuLyApi((nc, req) => moBaoCao(nc, loai(req), req.nextUrl.searchParams.get("ngay") || undefined), { quyen: "danh_gia.create" });
/** Lưu nháp, hoặc `nop: true` để nộp (bất biến sau khi nộp). */
export const POST = xuLyApi(async (nc, req) => luuBaoCao(nc, await docThan(req, LuocDoBaoCao)));
