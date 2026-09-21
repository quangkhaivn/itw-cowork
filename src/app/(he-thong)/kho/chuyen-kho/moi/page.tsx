import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachKho } from "@/modules/kho/service";
import FormChuyenKho from "./FormChuyenKho";

export const dynamic = "force-dynamic";

export default async function TrangLapChuyenKho() {
  const nd = await yeuCauQuyen("inventory.create");

  const kho = await docDuLieu(nd, (tx) => danhSachKho(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), true));

  return (
    <>
      <DauTrang
        tieuDe="Lập phiếu chuyển kho"
        duongDan={[{ nhan: "Kho" }, { nhan: "Chuyển kho nội bộ", href: "/kho/chuyen-kho" }]}
        moTa="Lập xong ở trạng thái Nháp. Hàng chỉ thật sự rời kho khi bấm Xuất, và chỉ vào kho đích khi bên kia bấm Nhận."
      />

      {kho.length < 2 ? (
        <section className="the">
          <TrongRong tieuDe="Cần ít nhất hai kho mới chuyển được">
            Hiện mới khai {kho.length === 0 ? "chưa có kho nào" : "một kho"}. Chuyển kho là điều hàng giữa hai kho khác
            nhau — khai thêm kho ở màn hình Kho → Danh sách kho trước.
          </TrongRong>
        </section>
      ) : (
        <FormChuyenKho
          kho={kho.map((k) => ({ id: k.id, ten: k.ten, macDinh: k.macDinh }))}
          khoNguonMacDinh={kho.find((k) => k.macDinh)?.id ?? kho[0].id}
        />
      )}
    </>
  );
}
