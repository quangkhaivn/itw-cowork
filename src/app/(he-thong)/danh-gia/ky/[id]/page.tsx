import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachPhieu } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

const NHAN_BUOC: Record<string, string> = { "nhan-vien": "Chờ tự đánh giá", "quan-ly": "Chờ quản lý chấm", "cho-chot": "Chờ chốt", "da-chot": "Đã chốt" };

/** Phiếu của một kỳ, theo phạm vi xem (quản lý: nhóm mình; Nhân sự / Giám đốc: toàn công ty). */
export default async function TrangKyDanhGia({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("danh_gia.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await docDuLieu(nd, async (tx) => {
    try {
      return await danhSachPhieu(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (e) {
      if (e instanceof LoiKhongTimThay) return null;
      throw e;
    }
  });
  if (!d) notFound();
  return (
    <>
      <DauTrang tieuDe={`Đánh giá ${d.ky.nhan}`} duongDan={[{ nhan: "Đánh giá nhân viên", href: "/danh-gia" }]} />
      <section className="the">
        {d.phieu.length === 0 ? <TrongRong tieuDe="Không có phiếu nào trong phạm vi của bạn" /> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Người</th><th>Quản lý</th><th>Bộ KPI</th><th>Bước</th><th className="so">Điểm</th><th>Xếp loại</th><th className="so">Hệ số thưởng</th></tr></thead>
            <tbody>{d.phieu.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/danh-gia/${p.id}`}>{p.hoTen}</Link></td><td>{p.quanLy ?? "—"}</td><td>{p.boKpi ?? "Đánh giá chung"}</td>
                <td><span className={`huy-hieu ${p.trangThai === "da-chot" ? "tot" : p.trangThai === "cho-chot" ? "canh-bao" : ""}`}>{NHAN_BUOC[p.trangThai]}</span></td>
                <td className="so">{p.tongDiem ?? "—"}</td><td>{p.xepLoai ?? "—"}{p.daDieuChinh && <span className="phu nho"> (đã điều chỉnh)</span>}</td><td className="so">{p.heSoThuong ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
