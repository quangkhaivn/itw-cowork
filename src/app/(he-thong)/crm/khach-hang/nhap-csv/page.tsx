import DauTrang from "@/components/ui/DauTrang";
import { yeuCauQuyen } from "@/lib/trang";
import NhapKhachCsv from "./NhapKhachCsv";

export const dynamic = "force-dynamic";

export default async function TrangNhapKhachCsv() {
  await yeuCauQuyen("customer.create");
  return (
    <>
      <DauTrang
        tieuDe="Nhập khách hàng từ CSV"
        duongDan={[{ nhan: "CRM" }, { nhan: "Khách hàng", href: "/crm/khach-hang" }]}
        moTa="Luôn xem trước rồi mới ghi. Có Mã KH hoặc trùng mã số thuế → cập nhật khách đã có; trùng điện thoại / email / tên gần giống → bỏ qua dòng, trừ khi bạn đã kiểm và xác nhận đều là khách mới."
      />
      <NhapKhachCsv />
    </>
  );
}
