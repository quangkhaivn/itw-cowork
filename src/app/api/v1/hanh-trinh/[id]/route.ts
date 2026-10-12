import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaTrangThaiHanhTrinh } from "@/modules/hanh-trinh/luoc-do";
import { suaTrangThaiHanhTrinh } from "@/modules/hanh-trinh/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(
  async (nc, req, { id }) => suaTrangThaiHanhTrinh(nc, id, await docThan(req, LuocDoSuaTrangThaiHanhTrinh)),
  { quyen: "customer.approve" },
);
