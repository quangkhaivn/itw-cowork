import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { xemKetNoi } from "@/modules/email/ket-noi";
import FormKetNoiEmail from "./FormKetNoiEmail";

export const dynamic = "force-dynamic";

export default async function TrangKetNoiEmail() {
  const nd = await yeuCauQuyen("integration.view");
  const kq = await docDuLieu(nd, (tx) => xemKetNoi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang
        tieuDe="Kết nối email"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Hộp thư hệ thống dùng để gửi chiến dịch email và thư thử. Mật khẩu được mã hóa trước khi lưu và không bao giờ hiện lại trên màn hình."
      />
      <FormKetNoiEmail
        ketNoi={{ ...kq.ketNoi, lanThuCuoi: kq.ketNoi.lanThuCuoi && { ...kq.ketNoi.lanThuCuoi, luc: kq.ketNoi.lanThuCuoi.luc.toISOString() }, capNhatLuc: kq.ketNoi.capNhatLuc?.toISOString() ?? null }}
        coKhoaMaHoa={kq.coKhoaMaHoa}
        goiY={kq.goiY}
        duocSua={coQuyen(nd.hoSo, "integration.update")}
        emailCuaToi={nd.hoSo.email}
      />
    </>
  );
}
