import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { xemHoSoCongTy } from "@/modules/ho-so-cong-ty/service";
import FormHoSoCongTy from "./FormHoSoCongTy";

export const dynamic = "force-dynamic";

export default async function TrangHoSoCongTy() {
  const nd = await yeuCauQuyen("setting.view");
  const hs = await docDuLieu(nd, (tx) => xemHoSoCongTy(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));

  return (
    <>
      <DauTrang
        tieuDe="Hồ sơ công ty"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Thông tin in lên đầu báo giá và các chứng từ sau này. Hệ thống không tự điền — mục nào chưa khai thì bản in để trống."
      />
      <FormHoSoCongTy duocSua={coQuyen(nd.hoSo, "setting.update")} muc={hs.muc} giaTri={hs.giaTri} thieu={hs.thieu} />
    </>
  );
}
