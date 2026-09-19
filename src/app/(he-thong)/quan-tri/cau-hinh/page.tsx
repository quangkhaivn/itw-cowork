import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { PHASE_HIEN_TAI } from "@/modules/cau-hinh/danh-muc";
import { tatCaCauHinh } from "@/modules/cau-hinh/service";
import FormCauHinh from "./FormCauHinh";

export const dynamic = "force-dynamic";

export default async function TrangCauHinh() {
  const nd = await yeuCauQuyen("setting.view");
  const ds = await docDuLieu(nd, (tx) => tatCaCauHinh(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));

  return (
    <>
      <DauTrang
        tieuDe="Cấu hình hệ thống"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Các ngưỡng nghiệp vụ. Không có con số nào được viết cứng trong mã — mọi ngưỡng đọc từ đây. Mỗi lần đổi đều ghi Nhật ký kiểm toán."
      />
      <FormCauHinh
        duocSua={coQuyen(nd.hoSo, "setting.update")}
        phaseHienTai={PHASE_HIEN_TAI}
        muc={ds.map((m) => ({
          khoa: m.khoa,
          nhom: m.nhom,
          nhan: m.nhan,
          moTa: m.moTa,
          donVi: m.donVi,
          toiThieu: m.toiThieu,
          toiDa: m.toiDa,
          soNguyen: m.soNguyen,
          macDinh: m.macDinh,
          giaTri: m.giaTri,
          dungTuPhase: m.dungTuPhase,
        }))}
      />
    </>
  );
}
