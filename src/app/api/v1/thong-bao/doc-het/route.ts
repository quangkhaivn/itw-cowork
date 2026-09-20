import { xuLyApi } from "@/lib/api";
import { danhDauDocHet } from "@/modules/thong-bao/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi((nc) => danhDauDocHet(nc));
