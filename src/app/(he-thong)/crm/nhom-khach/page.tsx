import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachNhomKhach } from "@/modules/nhom-khach/service";
import QuanLyNhom from "./QuanLyNhom";

export const dynamic = "force-dynamic";

export default async function TrangNhomKhach() {
  const nd = await yeuCauQuyen("customer.view");
  const kq = await docDuLieu(nd, (tx) => danhSachNhomKhach(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang
        tieuDe="Nhóm khách hàng"
        duongDan={[{ nhan: "CRM" }]}
        moTa="Gom khách theo nhóm (VIP, trường học, khách dự án…) — một khách thuộc được nhiều nhóm. Gắn khách vào nhóm ở danh sách khách (chọn nhiều dòng) hoặc trong trang khách. Số khách tính trong phạm vi bạn được xem."
      />
      <section className="the">
        <QuanLyNhom nhom={kq.nhom} quanLy={kq.quanLy} />
      </section>
    </>
  );
}
