import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import { LoiKhongTimThay } from "@/lib/loi";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietMau } from "@/modules/email/service";
import FormMau from "../FormMau";

export const dynamic = "force-dynamic";

export default async function TrangSuaMau({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const nd = await yeuCauQuyen("marketing.view");
  const m = await docDuLieu(nd, (tx) => chiTietMau(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id)).catch((loi) => {
    if (loi instanceof LoiKhongTimThay) return null;
    throw loi;
  });
  if (!m) notFound();
  return (
    <>
      <DauTrang
        tieuDe={m.ten}
        duongDan={[{ nhan: "Marketing" }, { nhan: "Mẫu email", href: "/marketing/email/mau" }]}
        moTa={m.trangThai === "luu-tru" ? "Mẫu đã lưu trữ — không chọn được cho chiến dịch mới." : undefined}
      />
      <FormMau
        id={m.id}
        ten={m.ten}
        tieuDe={m.tieuDe}
        khoi={m.khoi}
        luuTru={m.trangThai === "luu-tru"}
        duocSua={coQuyen(nd.hoSo, "marketing.update")}
        duocGuiThu={coQuyen(nd.hoSo, "marketing.create")}
        emailCuaToi={nd.hoSo.email}
      />
    </>
  );
}
