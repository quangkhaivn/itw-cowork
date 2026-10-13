import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { chiTietKhachHang } from "@/modules/khach-hang/service";
import GopKhach from "./GopKhach";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangGopKhach({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("customer.approve");
  const giuLaiId = layMot((await searchParams).giuLai);
  const giuLai = LA_UUID.test(giuLaiId)
    ? await docDuLieu(nd, async (tx) => {
        try {
          const k = await chiTietKhachHang(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), giuLaiId);
          return { id: k.id, ma: k.ma, ten: k.ten };
        } catch (e) {
          if (e instanceof LoiKhongTimThay) return null;
          throw e;
        }
      })
    : null;
  return (
    <>
      <DauTrang
        tieuDe="Gộp khách hàng trùng"
        duongDan={[{ nhan: "CRM" }, { nhan: "Khách hàng", href: "/crm/khach-hang" }]}
        moTa="Chọn khách GIỮ LẠI và khách BỊ GỘP. Mọi liên hệ, lead, tương tác, cơ hội, công việc, báo giá, đơn, hóa đơn, bảo hành, phiếu hỗ trợ, dự án, nhóm… của khách bị gộp chuyển sang khách giữ lại trong một lần. Khách bị gộp không bị xóa — chuyển trạng thái “Đã gộp” và trỏ sang khách giữ lại."
      />
      <GopKhach giuLaiBanDau={giuLai} />
    </>
  );
}
