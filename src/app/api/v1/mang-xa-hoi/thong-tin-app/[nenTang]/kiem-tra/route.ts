import { docThan } from "@/lib/api";
import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { LuocDoThongTinApp } from "@/modules/mang-xa-hoi/luoc-do";
import { kiemTraThongTinApp } from "@/modules/mang-xa-hoi/nen-tang-app";

/** Nút "Kiểm tra" (Meta gọi mạng ngoài giao dịch; bí mật đã lưu thì xếp việc cho worker). */
export const POST = xuLyApiNhieuBuoc<{ nenTang: string }>(async (nb, req, { nenTang }) => kiemTraThongTinApp(nb, nenTang.toUpperCase(), await docThan(req, LuocDoThongTinApp)), { quyen: "setting.update" });
