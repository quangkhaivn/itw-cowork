import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { xemKetNoi } from "@/modules/email/ket-noi";
import FormKetNoiEmail from "./FormKetNoiEmail";
import TenMienGui from "./TenMienGui";

export const dynamic = "force-dynamic";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export default async function TrangKetNoiEmail() {
  const nd = await yeuCauQuyen("integration.view");
  const kq = await docDuLieu(nd, (tx) => xemKetNoi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const k = kq.ketNoi;
  const duocSua = coQuyen(nd.hoSo, "integration.update");
  return (
    <>
      <DauTrang
        tieuDe="Kết nối email"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Hộp thư hệ thống dùng để gửi chiến dịch email và thư thử — SMTP bất kỳ hoặc Amazon SES. Mật khẩu được mã hóa trước khi lưu và không bao giờ hiện lại trên màn hình."
      />
      <FormKetNoiEmail
        ketNoi={{
          ...k,
          lanThuCuoi: k.lanThuCuoi && { ...k.lanThuCuoi, luc: k.lanThuCuoi.luc.toISOString() },
          capNhatLuc: iso(k.capNhatLuc),
          webhook: { ...k.webhook, doiLuc: iso(k.webhook.doiLuc), dangKyLuc: iso(k.webhook.dangKyLuc), suKienCuoiLuc: iso(k.webhook.suKienCuoiLuc) },
        }}
        coKhoaMaHoa={kq.coKhoaMaHoa}
        goiY={kq.goiY}
        duocSua={duocSua}
        emailCuaToi={nd.hoSo.email}
        hanMuc={kq.hanMuc}
      />
      <TenMienGui
        tenMien={kq.tenMien && { ...kq.tenMien, kiemLuc: iso(kq.tenMien.kiemLuc) }}
        duocSua={duocSua}
      />
    </>
  );
}
