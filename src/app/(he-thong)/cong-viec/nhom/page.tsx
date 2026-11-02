import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { viecCuaNhom } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** "Việc của nhóm" (phương án Nhân sự): ai đang làm gì, quá hạn, chờ nhận / chờ duyệt, khối lượng tuần, điểm tháng. */
export default async function TrangViecCuaNhom() {
  const nd = await yeuCauQuyen("task.view");
  const ds = await docDuLieu(nd, (tx) => viecCuaNhom(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const coDiem = ds.some((d) => d.diemThang !== null);
  return (
    <>
      <DauTrang tieuDe="Việc của nhóm" duongDan={[{ nhan: "Công việc", href: "/cong-viec" }]} moTa="Theo phạm vi xem công việc của bạn. Bấm số để mở danh sách việc của người đó." />
      <section className="the">
        {ds.length <= 1 ? (
          <TrongRong tieuDe="Bạn chưa quản lý ai">Trang này dành cho người có cấp dưới hoặc phạm vi xem công việc của nhóm / phòng.</TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Người</th>
                  <th className="so">Đang mở</th>
                  <th className="so">Quá hạn</th>
                  <th className="so">Chờ nhận</th>
                  <th className="so">Chờ duyệt</th>
                  <th className="so">Xong tuần này</th>
                  {coDiem && <th className="so">Điểm việc tháng</th>}
                </tr>
              </thead>
              <tbody>
                {ds.map((d) => (
                  <tr key={d.id}>
                    <td>{d.hoTen}</td>
                    <td className="so"><Link href={`/cong-viec?cheDo=tat-ca&nguoiPhuTrach=${d.id}`}>{d.dangMo}</Link></td>
                    <td className="so">{d.quaHan ? <span className="huy-hieu loi">{d.quaHan}</span> : 0}</td>
                    <td className="so">{d.choNhan ? <span className="huy-hieu canh-bao">{d.choNhan}</span> : 0}</td>
                    <td className="so"><Link href={`/cong-viec?cheDo=tat-ca&trangThai=cho-duyet&nguoiPhuTrach=${d.id}`}>{d.choDuyet}</Link></td>
                    <td className="so">{d.xongTuan}</td>
                    {coDiem && <td className="so">{d.diemThang ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
