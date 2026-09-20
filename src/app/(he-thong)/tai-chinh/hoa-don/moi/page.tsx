import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import FormHoaDon from "./FormHoaDon";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangLapHoaDon({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("finance.create");
  const sp = await searchParams;
  const donId = layMot(sp.donHang);
  const khachId = layMot(sp.khachHang);

  const { khach, don } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    let khach: { id: string; ma: string; ten: string } | null = null;
    let don: { id: string; so: string; trangThai: string; tongCong: string } | null = null;

    if (LA_UUID.test(donId) && coQuyen(nd.hoSo, "order.view")) {
      const d = await tx.salesOrder.findFirst({ where: { id: donId }, select: { id: true, number: true, status: true, total: true, customerId: true } });
      if (d && d.status !== "DRAFT" && d.status !== "CANCELLED") {
        don = { id: d.id, so: d.number, trangThai: d.status, tongCong: d.total.toString() };
        try {
          const k = await batBuocThayKhach(nc, d.customerId);
          khach = { id: k.id, ma: k.ma, ten: k.ten };
        } catch (loi) {
          if (!(loi instanceof LoiKhongTimThay)) throw loi;
        }
      }
    }
    if (!khach && LA_UUID.test(khachId)) {
      try {
        const k = await batBuocThayKhach(nc, khachId);
        khach = { id: k.id, ma: k.ma, ten: k.ten };
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }
    return { khach, don };
  });

  return (
    <>
      <DauTrang
        tieuDe="Lập hóa đơn"
        duongDan={[{ nhan: "Tài chính" }, { nhan: "Hóa đơn", href: "/tai-chinh/hoa-don" }]}
        moTa="Lập xong hóa đơn ở trạng thái Nháp. Phát hành mới là lúc chốt số tiền và bắt đầu tính công nợ."
      />
      <FormHoaDon khachBanDau={khach} donBanDau={don} />
    </>
  );
}
