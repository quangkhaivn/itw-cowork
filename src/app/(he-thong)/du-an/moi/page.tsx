import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import FormDuAn from "./FormDuAn";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangMoDuAn({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("project.create");
  const sp = await searchParams;
  const donId = layMot(sp.donHang);
  const khachId = layMot(sp.khachHang);

  const { nguoi, khach, donHang } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    let khach: { id: string; ma: string; ten: string } | null = null;
    let donHang: { id: string; so: string } | null = null;

    // Vào từ trang đơn hàng: lấy luôn khách của đơn.
    if (LA_UUID.test(donId) && coQuyen(nd.hoSo, "order.view")) {
      const don = await tx.salesOrder.findFirst({ where: { id: donId }, select: { id: true, number: true, customerId: true, status: true } });
      if (don && don.status !== "DRAFT") {
        donHang = { id: don.id, so: don.number };
        try {
          const k = await batBuocThayKhach(nc, don.customerId);
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
    return { nguoi: await danhSachNguoiPhuTrach(nc, "project.create"), khach, donHang };
  });

  return (
    <>
      <DauTrang
        tieuDe="Mở dự án triển khai"
        duongDan={[{ nhan: "Dự án", href: "/du-an" }]}
        moTa="Dự án gắn với một đơn hàng đã xác nhận: chia hạng mục, theo tiến độ, kết thúc bằng nghiệm thu."
      />
      <FormDuAn nguoiPhuTrach={nguoi} khachBanDau={khach} donHangBanDau={donHang} toiId={nd.hoSo.userId} />
    </>
  );
}
