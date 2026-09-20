import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import FormBaoTri from "./FormBaoTri";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangLapBaoTri({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("service_desk.create");
  const sp = await searchParams;
  const khachId = layMot(sp.khachHang);

  const { nguoi, khach } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const nguoi = await danhSachNguoiPhuTrach(nc, "service_desk.create");
    let khach: { id: string; ma: string; ten: string } | null = null;
    if (LA_UUID.test(khachId)) {
      try {
        const k = await batBuocThayKhach(nc, khachId);
        khach = { id: k.id, ma: k.ma, ten: k.ten };
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }
    return { nguoi, khach };
  });

  return (
    <>
      <DauTrang
        tieuDe="Lập hợp đồng bảo trì"
        duongDan={[{ nhan: "Dịch vụ" }, { nhan: "Hợp đồng bảo trì", href: "/dich-vu/bao-tri" }]}
        moTa="Đặt chu kỳ một lần, hệ thống tự nhắc đúng kỳ. Kỳ đầu tiên là ngày bắt đầu hợp đồng."
      />
      <FormBaoTri
        nguoiPhuTrach={nguoi.map((n) => ({ id: n.id, hoTen: n.fullName }))}
        toiId={nd.hoSo.userId}
        khachBanDau={khach}
      />
    </>
  );
}
