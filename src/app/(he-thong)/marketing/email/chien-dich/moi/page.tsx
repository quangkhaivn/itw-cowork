import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { danhSachMau, quyenGiaoDienEmail } from "@/modules/email/service";
import { luaChonPhanKhuc } from "@/modules/marketing/service";
import FormChienDichMoi from "./FormChienDichMoi";

export const dynamic = "force-dynamic";

export default async function TrangChienDichMoi() {
  const nd = await yeuCauQuyen("marketing.create");
  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const [mau, dl, pk] = await Promise.all([
      danhSachMau(nc, { q: "", luuTru: "" }),
      luaChonDuLieuGoc(nc, ["nguon_lead", "phan_khuc_khach_hang", "nganh_nghe"]),
      luaChonPhanKhuc(nc),
    ]);
    return { mau, dl, pk };
  });
  const q = quyenGiaoDienEmail(nd.hoSo);
  return (
    <>
      <DauTrang tieuDe="Lập đợt gửi email" duongDan={[{ nhan: "Marketing" }, { nhan: "Đợt gửi email", href: "/marketing/email/chien-dich" }]} />
      {du.mau.length === 0 ? (
        <TrongRong tieuDe="Chưa có mẫu email nào">
          <Link href="/marketing/email/mau/moi">Soạn mẫu</Link> trước, rồi quay lại lập chiến dịch.
        </TrongRong>
      ) : !q.xemLead && !q.xemLienHe && !q.phanKhuc ? (
        <TrongRong tieuDe="Bạn chưa chọn được người nhận">
          Cần quyền xem CRM (lead), xem khách hàng (liên hệ) hoặc sửa Marketing (phân khúc). Đề nghị Quản trị cấp quyền.
        </TrongRong>
      ) : (
        <FormChienDichMoi
          mau={du.mau.map((m) => ({ id: m.id, ten: m.ten }))}
          luaChon={{ nguon: du.dl["nguon_lead"] ?? [], phanKhuc: du.dl["phan_khuc_khach_hang"] ?? [], nganh: du.dl["nganh_nghe"] ?? [] }}
          xemLead={q.xemLead}
          xemLienHe={q.xemLienHe}
          dsPhanKhuc={du.pk}
          xemPhanKhuc={q.phanKhuc}
        />
      )}
    </>
  );
}
