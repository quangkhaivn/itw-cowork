import DauTrang from "@/components/ui/DauTrang";
import { yeuCauQuyen } from "@/lib/trang";
import FormMau from "../FormMau";

export const dynamic = "force-dynamic";

const KHOI_MAU = [
  { loai: "tieu-de" as const, noiDung: "Kính gửi {{ten}}" },
  { loai: "doan-van" as const, noiDung: "{{cong_ty_gui}} xin gửi tới {{cong_ty}} chương trình ưu đãi tháng này." },
  { loai: "nut" as const, nhan: "Xem chi tiết", url: "https://thegioitinhoc.vn" },
];

export default async function TrangMauMoi() {
  const nd = await yeuCauQuyen("marketing.create");
  return (
    <>
      <DauTrang tieuDe="Soạn mẫu email" duongDan={[{ nhan: "Marketing" }, { nhan: "Mẫu email", href: "/marketing/email/mau" }]} />
      <FormMau id={null} ten="" tieuDe="" khoi={KHOI_MAU} luuTru={false} duocSua duocGuiThu emailCuaToi={nd.hoSo.email} />
    </>
  );
}
