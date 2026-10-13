import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import SuaPhanKhuc from "../SuaPhanKhuc";
import { docLuaChonPhanKhuc } from "../lua-chon";

export const dynamic = "force-dynamic";

export default async function TrangTaoPhanKhuc() {
  const nd = await yeuCauQuyen("marketing.create");
  const lc = await docDuLieu(nd, (tx) => docLuaChonPhanKhuc(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang tieuDe="Tạo phân khúc" duongDan={[{ nhan: "Marketing" }, { nhan: "Phân khúc", href: "/marketing/phan-khuc" }]} />
      <SuaPhanKhuc luaChon={lc} duocSua banDau={{ ten: "", ghiChu: "", doiTuong: "lead", dieuKien: {} }} />
    </>
  );
}
