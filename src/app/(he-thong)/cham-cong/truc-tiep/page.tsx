import DauTrang from "@/components/ui/DauTrang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import BangTrucTiep from "./BangTrucTiep";
import NgayThieuGio from "./NgayThieuGio";

export const dynamic = "force-dynamic";

/** Bảng chấm công trực tiếp (NS-60): tự cập nhật mỗi 10 giây, phạm vi theo quyền `cham_cong.view`. */
export default async function TrangTrucTiep() {
  const nd = await yeuCauQuyen("cham_cong.view");
  const { phongBan, diaDiem } = await docDuLieu(nd, async (tx) => ({
    phongBan: await tx.department.findMany({ where: { status: "hoat-dong" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    diaDiem: await tx.workLocation.findMany({ where: { status: "hoat-dong" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  }));
  return (
    <>
      <DauTrang
        tieuDe="Bảng chấm công trực tiếp"
        duongDan={[{ nhan: "Nhân sự" }]}
        moTa="Ai đã vào ca, ai chưa đến, ai đi muộn, ai nghỉ phép, ai đang ở hiện trường — tự cập nhật mỗi 10 giây. Bạn chỉ thấy những người trong phạm vi quản lý của mình."
      />
      <NgayThieuGio />
      <BangTrucTiep phongBan={phongBan.map((p) => ({ id: p.id, ten: p.name }))} diaDiem={diaDiem.map((d) => ({ id: d.id, ten: d.name }))} />
    </>
  );
}
