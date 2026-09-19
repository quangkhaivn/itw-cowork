import DauTrang from "@/components/ui/DauTrang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonChoForm } from "@/modules/nguoi-dung/service";
import FormNguoiDung from "../FormNguoiDung";

export const dynamic = "force-dynamic";

export default async function TrangTaoNguoiDung() {
  const nd = await yeuCauQuyen("user.create");
  const luaChon = await docDuLieu(nd, (tx) => luaChonChoForm(tx));

  return (
    <>
      <DauTrang
        tieuDe="Thêm người dùng"
        duongDan={[{ nhan: "Quản trị" }, { nhan: "Người dùng", href: "/quan-tri/nguoi-dung" }]}
      />
      <FormNguoiDung
        luaChon={luaChon}
        duocDoiVaiTro={coQuyen(nd.hoSo, "role.update")}
        banDau={{
          email: "",
          hoTen: "",
          dienThoai: "",
          maNhanVien: "",
          chucDanh: "",
          phongBanId: "",
          quanLyId: "",
          vaiTroIds: [],
        }}
      />
    </>
  );
}
