import { redirect } from "next/navigation";
import { layNguoiDungHienTai } from "@/lib/trang";
import FormDoiMatKhau from "./FormDoiMatKhau";

export const dynamic = "force-dynamic";

/**
 * Trang đổi mật khẩu đứng riêng, ngoài khung ứng dụng — vì người đang bị bắt đổi mật
 * khẩu không được vào khung ứng dụng cho tới khi đổi xong.
 */
export default async function TrangDoiMatKhau() {
  const nd = await layNguoiDungHienTai();
  if (!nd) redirect("/dang-nhap");
  return <FormDoiMatKhau email={nd.hoSo.email} batBuoc={nd.hoSo.phaiDoiMatKhau} />;
}
