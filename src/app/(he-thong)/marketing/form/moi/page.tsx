import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { luaChonChienDich } from "@/modules/marketing/chung";
import FormSuaForm from "../FormSuaForm";

export const dynamic = "force-dynamic";

export default async function TrangTaoForm() {
  const nd = await yeuCauQuyen("marketing.create");
  const { cd, nguon } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { cd: await luaChonChienDich(nc), nguon: (await luaChonDuLieuGoc(nc, ["nguon_lead"])).nguon_lead };
  });
  return (
    <>
      <DauTrang tieuDe="Tạo form đăng ký" duongDan={[{ nhan: "Marketing" }, { nhan: "Form đăng ký", href: "/marketing/form" }]} />
      <FormSuaForm
        chienDich={cd}
        nguon={nguon}
        banDau={{
          ten: "", slug: "", tieuDe: "Đăng ký tư vấn", gioiThieu: "", nutGui: "Gửi đăng ký", loiCamOn: "Cảm ơn bạn! Chúng tôi sẽ liên hệ lại sớm.",
          cauDongY: "", chienDichId: "", nguon: "website", trangThai: "hoat-dong",
          truong: [
            { khoa: "hoTen", nhan: "Họ tên", batBuoc: true },
            { khoa: "dienThoai", nhan: "Số điện thoại", batBuoc: true },
            { khoa: "email", nhan: "Email", batBuoc: false },
            { khoa: "nhuCau", nhan: "Nhu cầu", batBuoc: false },
          ],
        }}
      />
    </>
  );
}
