import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { kiemTraTenMienGui } from "@/modules/email/ket-noi";

export const dynamic = "force-dynamic";

/** Kiểm tra DNS tên miền gửi — tra DNS NGOÀI giao dịch CSDL (QĐ-89, EG-12). */
export const POST = xuLyApiNhieuBuoc((nb) => kiemTraTenMienGui(nb), { quyen: "integration.update" });
