import { xuLyApi } from "@/lib/api";
import { mauCsvKhach } from "@/modules/khach-hang/nhap-xuat";

export const dynamic = "force-dynamic";

export const GET = xuLyApi(() => Promise.resolve({ tenTep: "mau-khach-hang.csv", noiDung: mauCsvKhach() }), { quyen: "customer.create" });
