import DauTrang from "@/components/ui/DauTrang";
import FormThuongHieu from "@/components/mang-xa-hoi/FormThuongHieu";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { xemHoSoThuongHieu } from "@/modules/mang-xa-hoi/thuong-hieu";

export const dynamic = "force-dynamic";

/** Hồ sơ thương hiệu (0.25.0, QĐ-235): dùng trong lời nhắc AI và cảnh báo (không chặn) trên bài soạn tay. */
export default async function TrangThuongHieu() {
  const nd = await yeuCauQuyen("mxh.view");
  const hs = await docDuLieu(nd, (tx) => xemHoSoThuongHieu(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang tieuDe="Hồ sơ thương hiệu" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa={<>Giọng văn, từ cấm, câu / hashtag bắt buộc, CTA và bài mẫu. AI viết bài theo hồ sơ này; bài soạn tay vi phạm chỉ bị <strong>cảnh báo</strong>, không bị chặn.{hs.suaLuc && <> · Sửa lần cuối {dinhDangNgayGio(hs.suaLuc)}{hs.suaBoi ? ` bởi ${hs.suaBoi}` : ""}</>}</>} />
      <FormThuongHieu hs={hs} suaDuoc={hs.suaDuoc} />
    </>
  );
}
