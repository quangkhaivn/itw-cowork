import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { phienBanUngDung } from "@/lib/phien-ban";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { PHASE_HIEN_TAI } from "@/modules/cau-hinh/danh-muc";
import { tatCaCauHinh } from "@/modules/cau-hinh/service";
import FormCauHinh from "./FormCauHinh";

export const dynamic = "force-dynamic";

export default async function TrangCauHinh() {
  const nd = await yeuCauQuyen("setting.view");
  const ds = await docDuLieu(nd, (tx) => tatCaCauHinh(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const pb = phienBanUngDung();

  return (
    <>
      <DauTrang
        tieuDe="Cấu hình hệ thống"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Các ngưỡng nghiệp vụ. Không có con số nào được viết cứng trong mã — mọi ngưỡng đọc từ đây. Mỗi lần đổi đều ghi Nhật ký kiểm toán."
      />
      <section className="the">
        <div className="dau">
          <h2>Máy chủ này đang chạy bản nào</h2>
        </div>
        <div className="than">
          <dl className="ds-mo-ta">
            <dt>Phiên bản</dt>
            <dd>
              <strong>{pb.so}</strong>
            </dd>
            <dt>Mã bản dựng</dt>
            <dd>{pb.maBanDung ?? <span className="phu">chế độ phát triển</span>}</dd>
            <dt>Dựng lúc</dt>
            <dd>{pb.dungLuc ? dinhDangNgayGio(pb.dungLuc) : <span className="phu">không đọc được</span>}</dd>
          </dl>
          <p className="goi-y" style={{ marginBottom: 0 }}>
            Mã bản dựng đổi mỗi lần dựng lại, nên nó trả lời được câu hỏi thật sự quan trọng sau mỗi lần triển khai:
            mã đang chạy có đúng là mã vừa gửi lên không. Hai bản dựng khác nhau vẫn có thể cùng số phiên bản.
          </p>
        </div>
      </section>

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
