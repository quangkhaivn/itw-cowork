import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDatLaiMatKhau } from "@/modules/nguoi-dung/luoc-do";
import { datLaiMatKhau } from "@/modules/nguoi-dung/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoDatLaiMatKhau);
  return datLaiMatKhau(nc, id, d.matKhauMoi, d.batDoiMatKhau);
});
