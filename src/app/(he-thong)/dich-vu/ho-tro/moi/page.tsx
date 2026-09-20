import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import FormPhieuHoTro from "./FormPhieuHoTro";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangMoPhieu({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("service_desk.create");
  const khachId = layMot((await searchParams).khachHang);

  const { nguoi, khach } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    let khach: { id: string; ma: string; ten: string } | null = null;
    if (LA_UUID.test(khachId)) {
      try {
        const k = await batBuocThayKhach(nc, khachId);
        khach = { id: k.id, ma: k.ma, ten: k.ten };
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }
    return { nguoi: await danhSachNguoiPhuTrach(nc, "service_desk.update"), khach };
  });

  return (
    <>
      <DauTrang
        tieuDe="Mở phiếu hỗ trợ"
        duongDan={[{ nhan: "Dịch vụ" }, { nhan: "Phiếu hỗ trợ", href: "/dich-vu/ho-tro" }]}
        moTa="Tra số sê-ri trước: chọn đúng máy thì khách hàng, đơn hàng và tình trạng bảo hành tự điền."
      />
      <FormPhieuHoTro nguoiXuLy={nguoi} khachBanDau={khach} />
    </>
  );
}
