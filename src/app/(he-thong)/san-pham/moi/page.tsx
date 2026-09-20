import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { luaChonDanhMuc } from "@/modules/danh-muc-san-pham/service";
import { luaChonNhaCungCap } from "@/modules/nha-cung-cap/service";
import FormSanPham from "../FormSanPham";

export const dynamic = "force-dynamic";

export default async function TrangTaoSanPham() {
  const nd = await yeuCauQuyen("product.create");
  const luaChon = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const danhMuc = await luaChonDanhMuc(nc);
    return {
      nhom: danhMuc.nhom,
      thuongHieu: danhMuc.thuongHieu,
      donViTinh: (await luaChonDuLieuGoc(nc, ["don_vi_tinh"])).don_vi_tinh,
      nhaCungCap: coQuyen(nd.hoSo, "supplier.view") ? await luaChonNhaCungCap(nc) : [],
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Thêm sản phẩm"
        duongDan={[{ nhan: "Sản phẩm", href: "/san-pham" }]}
        moTa="Chọn nhóm trước — bảo hành, thuế suất và yêu cầu số sê-ri sẽ tự điền theo nhóm."
      />
      <FormSanPham
        luaChon={luaChon}
        banDau={{
          sku: "",
          ten: "",
          nhomId: "",
          thuongHieuId: "",
          model: "",
          donViTinh: "",
          giaVon: "",
          giaBan: "",
          vat: "10",
          baoHanhThang: "",
          batBuocSerial: false,
          nhaCungCapMacDinhId: "",
          moTa: "",
          thongSo: [],
          trangThai: "hoat-dong",
        }}
      />
    </>
  );
}
