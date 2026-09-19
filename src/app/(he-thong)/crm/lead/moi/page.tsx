import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import FormLead from "../FormLead";

export const dynamic = "force-dynamic";

export default async function TrangTaoLead() {
  const nd = await yeuCauQuyen("crm.create");
  const { nguon, nguoi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { nguon: (await luaChonDuLieuGoc(nc, ["nguon_lead"])).nguon_lead, nguoi: await danhSachNguoiPhuTrach(nc, "crm.create") };
  });
  return (
    <>
      <DauTrang tieuDe="Thêm lead" duongDan={[{ nhan: "CRM" }, { nhan: "Lead", href: "/crm/lead" }]} />
      <FormLead
        nguon={nguon}
        nguoiPhuTrach={nguoi}
        banDau={{
          hoTen: "",
          congTy: "",
          chucDanh: "",
          dienThoai: "",
          email: "",
          maSoThue: "",
          nguon: "",
          nhuCau: "",
          giaTriUocTinh: "",
          nguoiPhuTrachId: nd.hoSo.userId,
          ghiChu: "",
        }}
      />
    </>
  );
}
