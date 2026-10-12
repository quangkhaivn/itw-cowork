import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { luaChonChienDich } from "@/modules/marketing/chung";
import FormNhapTay from "./FormNhapTay";

export const dynamic = "force-dynamic";

export default async function TrangNhapTayLead() {
  const nd = await yeuCauQuyen("marketing.create");
  const { cd, nguon } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { cd: await luaChonChienDich(nc), nguon: (await luaChonDuLieuGoc(nc, ["nguon_lead"])).nguon_lead };
  });
  return (
    <>
      <DauTrang
        tieuDe="Nhập tay lead"
        duongDan={[{ nhan: "Marketing" }, { nhan: "Nhận lead", href: "/marketing/nhan-lead" }]}
        moTa="Lead từ hội thảo, danh thiếp, cuộc gọi đến tổng đài marketing. Hệ thống tự dò trùng và chia cho sale như lead từ form."
      />
      <FormNhapTay chienDich={cd.filter((c) => c.trangThai !== "ket-thuc")} nguon={nguon} />
    </>
  );
}
