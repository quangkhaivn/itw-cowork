import DauTrang from "@/components/ui/DauTrang";
import FormSoanBai from "@/components/mang-xa-hoi/FormSoanBai";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachKenh } from "@/modules/mang-xa-hoi/kenh";

export const dynamic = "force-dynamic";

export default async function TrangSoanBai() {
  const nd = await yeuCauQuyen("mxh.create");
  const kenh = await docDuLieu(nd, (tx) => danhSachKenh(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang tieuDe="Soạn bài" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa="Viết nội dung, chọn kênh rồi lưu nháp. Sau đó thêm ảnh (ảnh đầu tiên làm ảnh đại diện WordPress) và Đăng ngay / Hẹn giờ — hoặc Gửi duyệt nếu bạn không có quyền đăng." />
      <FormSoanBai kenh={kenh.map((k) => ({ id: k.id, ten: k.ten, tenNenTang: k.tenNenTang, trangThai: k.trangThai }))} />
    </>
  );
}
