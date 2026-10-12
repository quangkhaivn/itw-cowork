import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhomCuaKhach } from "@/modules/nhom-khach/luoc-do";
import { datNhomChoKhach } from "@/modules/nhom-khach/service";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(
  async (nc, req, { id }) => datNhomChoKhach(nc, id, (await docThan(req, LuocDoNhomCuaKhach)).nhomIds),
  { quyen: "customer.update" },
);
