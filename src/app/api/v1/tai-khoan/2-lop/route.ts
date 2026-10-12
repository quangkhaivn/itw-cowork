import { xuLyApi } from "@/lib/api";
import { trangThai2LopCuaToi } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => trangThai2LopCuaToi(nc), { choPhepKhiPhaiBat2Lop: true });
