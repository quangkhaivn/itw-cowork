import { redirect } from "next/navigation";
import { layPhienHienTai } from "@/lib/xac-thuc";

export const dynamic = "force-dynamic";

export default async function Trang() {
  const phien = await layPhienHienTai();
  redirect(phien ? "/bang-dieu-khien" : "/dang-nhap");
}
