import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { cayNhomSanPham } from "@/modules/danh-muc-san-pham/service";
import QuanLyNhom from "./QuanLyNhom";

export const dynamic = "force-dynamic";

export default async function TrangNhomSanPham() {
  const nd = await yeuCauQuyen("product.view");
  const nhom = await docDuLieu(nd, (tx) => cayNhomSanPham(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));

  return (
    <>
      <DauTrang
        tieuDe="Nhóm sản phẩm"
        duongDan={[{ nhan: "Sản phẩm", href: "/san-pham" }]}
        moTa="Nhóm quyết định giá trị mặc định khi tạo sản phẩm: bảo hành, thuế suất và có quản lý số sê-ri hay không. Nhóm có thể lồng nhau."
      />
      <QuanLyNhom nhom={nhom} duocSua={coQuyen(nd.hoSo, "product.update")} />
    </>
  );
}
