import DauTrang from "@/components/ui/DauTrang";
import FormTrangCongKhai from "@/components/mang-xa-hoi/FormTrangCongKhai";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachTrang } from "@/modules/mang-xa-hoi/trang-cong-khai";

export const dynamic = "force-dynamic";

const TEN: Record<string, string> = { "dieu-khoan": "Điều khoản sử dụng", "quyen-rieng-tu": "Chính sách quyền riêng tư", "xoa-du-lieu": "Hướng dẫn xóa dữ liệu" };

/** Quản trị → Trang công khai (0.24.0, QĐ-207): ba trang Meta / Google đòi khi duyệt app. Chưa sửa = bản mẫu cần luật sư rà. */
export default async function TrangQuanTriCongKhai() {
  const nd = await yeuCauQuyen("setting.view");
  const d = await docDuLieu(nd, (tx) => danhSachTrang(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const sua = coQuyen(nd.hoSo, "setting.update");
  return (
    <>
      <DauTrang tieuDe="Trang công khai" duongDan={[{ nhan: "Quản trị" }]}
        moTa="Ba trang công khai (không cần đăng nhập) Meta / Google bắt buộc khi tạo / duyệt app. Nội dung mặc định là BẢN MẪU — cần luật sư rà trước khi dùng. Chữ thường: dòng “## ” là tiêu đề mục, “- ” là gạch đầu dòng." />
      {d.ds.map((t) => (
        <section className="the" key={t.trang}>
          <div className="dau"><h2>{TEN[t.trang]}</h2><a className="phu nho" href={`/${t.trang}?dn=${encodeURIComponent(d.maDoanhNghiep)}`} target="_blank" rel="noopener noreferrer">Xem trang ↗</a></div>
          <div className="than" style={{ padding: 16 }}>
            {t.laMau && <div className="hop-thong-bao canh-bao">Đang hiện bản mẫu — cần luật sư rà.</div>}
            <FormTrangCongKhai trang={t.trang} tieuDe={t.tieuDe} noiDung={t.noiDung} sua={sua} />
          </div>
        </section>
      ))}
    </>
  );
}
