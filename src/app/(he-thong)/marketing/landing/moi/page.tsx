import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonChienDich } from "@/modules/marketing/chung";
import { danhSachForm } from "@/modules/marketing/service";
import SuaLanding from "../SuaLanding";

export const dynamic = "force-dynamic";

export default async function TrangTaoLanding() {
  const nd = await yeuCauQuyen("marketing.create");
  const { forms, cd } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { forms: await danhSachForm(nc), cd: await luaChonChienDich(nc) };
  });
  return (
    <>
      <DauTrang tieuDe="Tạo landing page" duongDan={[{ nhan: "Marketing" }, { nhan: "Landing page", href: "/marketing/landing" }]} />
      <SuaLanding
        forms={forms.map((f) => ({ id: f.id, ten: f.ten, trangThai: f.trangThai }))}
        chienDich={cd}
        banDau={{ ten: "", slug: "", tieuDe: "", moTa: "", formId: forms.find((f) => f.trangThai === "hoat-dong")?.id ?? "", chienDichId: "", khoi: [], khoiB: null }}
      />
    </>
  );
}
