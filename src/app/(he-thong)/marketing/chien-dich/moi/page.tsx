import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import FormChienDich from "../FormChienDich";

export const dynamic = "force-dynamic";

export default async function TrangTaoChienDich() {
  const nd = await yeuCauQuyen("marketing.create");
  const nguoi = await docDuLieu(nd, (tx) => danhSachNguoiPhuTrach(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), "marketing.create"));
  return (
    <>
      <DauTrang tieuDe="Thêm chiến dịch" duongDan={[{ nhan: "Marketing" }, { nhan: "Chiến dịch marketing", href: "/marketing/chien-dich" }]} />
      <FormChienDich
        nguoiPhuTrach={nguoi}
        banDau={{ ten: "", kenh: "facebook", utmCampaign: "", ngayBatDau: "", ngayKetThuc: "", nganSach: "", mucTieuLead: "", nguoiPhuTrachId: nd.hoSo.userId, ghiChu: "" }}
      />
    </>
  );
}
