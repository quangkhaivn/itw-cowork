import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { xemQuanTri2Lop } from "@/modules/xac-thuc-2-lop/service";
import QuanTri2Lop from "./QuanTri2Lop";

export const dynamic = "force-dynamic";

export default async function TrangQuanTri2Lop() {
  const nd = await yeuCauQuyen("user.view");
  const kq = await docDuLieu(nd, (tx) => xemQuanTri2Lop(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang
        tieuDe="Xác thực 2 lớp"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Mỗi người tự bật ở Tài khoản của tôi. Ở đây: chọn vai trò bắt buộc phải bật, và đặt lại cho người mất điện thoại."
      />
      <QuanTri2Lop
        chinhSach={kq.chinhSach}
        vaiTro={kq.vaiTro}
        nguoi={kq.nguoi.map((n) => ({ ...n, batLuc: n.batLuc?.toISOString() ?? null }))}
        coKhoaMaHoa={kq.coKhoaMaHoa}
        duocSuaChinhSach={coQuyen(nd.hoSo, "setting.update")}
        duocDatLai={coQuyen(nd.hoSo, "user.update")}
        toi={nd.hoSo.userId}
      />
    </>
  );
}
