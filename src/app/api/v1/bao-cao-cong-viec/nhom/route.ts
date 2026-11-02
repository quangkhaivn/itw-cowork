import { xuLyApi } from "@/lib/api";
import { bangBaoCaoNhom } from "@/modules/bao-cao-cong-viec/service";

export const dynamic = "force-dynamic";

/** DG-45: báo cáo của cả nhóm (theo phạm vi danh_gia.view + cấp dưới trực tiếp). */
export const GET = xuLyApi(
  (nc, req) => bangBaoCaoNhom(nc, req.nextUrl.searchParams.get("loai") === "ngay" ? "ngay" : "tuan", req.nextUrl.searchParams.get("ngay") || undefined),
  { quyen: "danh_gia.view" },
);
