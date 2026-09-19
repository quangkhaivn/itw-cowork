import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { LOAI_DU_LIEU_KHACH } from "@/modules/khach-hang/service";
import FormKhachHang from "../FormKhachHang";

export const dynamic = "force-dynamic";

export default async function TrangTaoKhachHang() {
  const nd = await yeuCauQuyen("customer.create");
  const { luaChon, nguoi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      luaChon: await luaChonDuLieuGoc(nc, LOAI_DU_LIEU_KHACH),
      nguoi: await danhSachNguoiPhuTrach(nc, "customer.create"),
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Thêm khách hàng"
        duongDan={[{ nhan: "CRM" }, { nhan: "Khách hàng", href: "/crm/khach-hang" }]}
        moTa="Hệ thống tự dò khách trùng theo mã số thuế, điện thoại, email và tên gần giống ngay khi bạn rời mỗi ô."
      />
      <FormKhachHang
        luaChon={luaChon}
        nguoiPhuTrach={nguoi}
        banDau={{
          ten: "",
          maSoThue: "",
          loaiKhach: "",
          phanKhuc: "",
          nganh: "",
          nguon: "",
          diaChi: "",
          tinhThanh: "",
          website: "",
          dienThoai: "",
          email: "",
          nguoiPhuTrachId: nd.hoSo.userId,
          ghiChu: "",
          trangThai: "tiem-nang",
        }}
      />
    </>
  );
}
