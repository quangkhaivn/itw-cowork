import DauTrang from "@/components/ui/DauTrang";
import FormSoanBai from "@/components/mang-xa-hoi/FormSoanBai";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachKenh } from "@/modules/mang-xa-hoi/kenh";
import { danhSachChienDich } from "@/modules/mang-xa-hoi/chien-dich";

export const dynamic = "force-dynamic";

export default async function TrangSoanBai() {
  const nd = await yeuCauQuyen("mxh.create");
  const { kenh, chienDich } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { kenh: await danhSachKenh(nc), chienDich: await danhSachChienDich(nc) };
  });
  return (
    <>
      <DauTrang tieuDe="Soạn bài" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa="Viết nội dung, chọn kênh rồi lưu nháp. Sau đó thêm ảnh / video (tải lên hoặc chọn từ Google Drive) và Đăng ngay / Hẹn giờ — hoặc Gửi duyệt nếu bạn không có quyền đăng. Cowork kiểm định dạng theo từng nền tảng trước khi xếp lịch." />
      <FormSoanBai kenh={kenh.map((k) => ({ id: k.id, ten: k.ten, tenNenTang: k.tenNenTang, trangThai: k.trangThai, nenTang: k.nenTang, oauth: k.oauth }))} chienDich={chienDich.map((c) => ({ id: c.id, ten: c.ten }))} />
    </>
  );
}
