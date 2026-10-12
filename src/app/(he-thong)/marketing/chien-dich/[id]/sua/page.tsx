import { redirect } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNhapTien } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { chiTietChienDich } from "@/modules/marketing/service";
import FormChienDich from "../../FormChienDich";

export const dynamic = "force-dynamic";

export default async function TrangSuaChienDich({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nd = await yeuCauQuyen("marketing.update");
  const { ct, nguoi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { ct: await chiTietChienDich(nc, id), nguoi: await danhSachNguoiPhuTrach(nc, "marketing.update") };
  });
  if (!ct.quyen.sua) redirect(`/marketing/chien-dich/${id}`);
  const c = ct.chienDich;
  return (
    <>
      <DauTrang tieuDe={`Sửa ${c.ma}`} duongDan={[{ nhan: "Marketing" }, { nhan: "Chiến dịch", href: "/marketing/chien-dich" }, { nhan: c.ten, href: `/marketing/chien-dich/${id}` }]} />
      <FormChienDich
        nguoiPhuTrach={nguoi.some((n) => n.id === c.nguoiPhuTrach.id) ? nguoi : [{ id: c.nguoiPhuTrach.id, fullName: c.nguoiPhuTrach.hoTen }, ...nguoi]}
        nganSachDaDuyet={c.nganSachDaDuyet ? dinhDangNhapTien(String(Math.round(Number(c.nganSachDaDuyet)))) : null}
        banDau={{
          id,
          ten: c.ten,
          kenh: c.kenh,
          utmCampaign: c.utmCampaign ?? "",
          ngayBatDau: c.ngayBatDau ?? "",
          ngayKetThuc: c.ngayKetThuc ?? "",
          nganSach: dinhDangNhapTien(String(Math.round(Number(c.nganSach)))),
          mucTieuLead: c.mucTieuLead === null ? "" : String(c.mucTieuLead),
          nguoiPhuTrachId: c.nguoiPhuTrach.id,
          ghiChu: c.ghiChu ?? "",
        }}
      />
    </>
  );
}
