import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDoiHanhTrinh } from "@/modules/hanh-trinh/luoc-do";
import { doiHanhTrinh, lichSuHanhTrinh } from "@/modules/hanh-trinh/service";
import { chiTietKhachHang } from "@/modules/khach-hang/service";

export const dynamic = "force-dynamic";

/** Lịch sử hành trình của khách — kiểm phạm vi xem trước. */
export const GET = xuLyApi<{ id: string }>(async (nc, _req, { id }) => {
  await chiTietKhachHang(nc, id);
  return lichSuHanhTrinh(nc, id);
}, { quyen: "customer.view" });

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => doiHanhTrinh(nc, id, await docThan(req, LuocDoDoiHanhTrinh)), { quyen: "customer.update" });
