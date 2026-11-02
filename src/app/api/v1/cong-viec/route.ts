import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachViec, LuocDoLocViec, LuocDoTaoViec, taoViec } from "@/modules/cong-viec/service";
import { giaoNhieuNguoi } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachViec(nc, docTruyVan(req, LuocDoLocViec)), { quyen: "task.view" });
/** 0.20.0 (DG-08): `nguoiPhuTrachIds` ≥ 2 người → mỗi người một việc, chung nhóm. */
export const POST = xuLyApi(async (nc, req) => {
  const d = await docThan(req, LuocDoTaoViec);
  const ds = [...new Set(d.nguoiPhuTrachIds ?? [])];
  if (ds.length >= 2) return giaoNhieuNguoi(nc, d);
  return taoViec(nc, { ...d, nguoiPhuTrachId: ds[0] ?? d.nguoiPhuTrachId, nguoiPhuTrachIds: undefined });
});
