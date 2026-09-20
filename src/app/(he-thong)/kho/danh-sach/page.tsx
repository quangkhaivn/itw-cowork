import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachKho } from "@/modules/kho/service";
import QuanLyKho from "./QuanLyKho";

export const dynamic = "force-dynamic";

export default async function TrangDanhSachKho() {
  const nd = await yeuCauQuyen("inventory.view");

  const kho = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const ds = await danhSachKho(nc);
    const dem = await tx.inventoryBalance.groupBy({ by: ["warehouseId"], where: { onHand: { gt: 0 } }, _count: { _all: true } });
    const theoKho = new Map(dem.map((d) => [d.warehouseId, d._count._all]));
    return ds.map((k) => ({ ...k, soMatHang: theoKho.get(k.id) ?? 0 }));
  });

  return (
    <>
      <DauTrang
        tieuDe="Danh sách kho"
        duongDan={[{ nhan: "Kho" }, { nhan: "Tồn kho", href: "/kho" }]}
        moTa="Mỗi kho là một nơi chứa hàng thật. Kho mặc định được chọn sẵn khi nhập và khi xuất hàng."
      />
      <QuanLyKho kho={kho} duocTao={coQuyen(nd.hoSo, "inventory.create")} duocSua={coQuyen(nd.hoSo, "inventory.update")} />
    </>
  );
}
