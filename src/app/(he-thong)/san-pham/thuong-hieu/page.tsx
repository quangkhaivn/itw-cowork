import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachThuongHieu } from "@/modules/danh-muc-san-pham/service";
import QuanLyThuongHieu from "./QuanLyThuongHieu";

export const dynamic = "force-dynamic";

export default async function TrangThuongHieu() {
  const nd = await yeuCauQuyen("product.view");
  const ds = await docDuLieu(nd, (tx) => danhSachThuongHieu(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang tieuDe="Thương hiệu" duongDan={[{ nhan: "Sản phẩm", href: "/san-pham" }]} moTa="Hãng sản xuất của sản phẩm — dùng để lọc danh mục và báo cáo theo hãng." />
      <QuanLyThuongHieu thuongHieu={ds} duocSua={coQuyen(nd.hoSo, "product.update")} />
    </>
  );
}
