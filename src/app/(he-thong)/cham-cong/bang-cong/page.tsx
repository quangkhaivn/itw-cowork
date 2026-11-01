import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachBangCong } from "@/modules/cham-cong/bang-cong";
import TacVuBangCong from "./TacVuBangCong";

export const dynamic = "force-dynamic";

/** Bảng công tháng (NS-50 → NS-54): Nhân sự sinh nháp → nhân viên phản hồi → giải quyết → khóa → xuất CSV. */
export default async function TrangBangCong() {
  const nd = await yeuCauQuyen("cham_cong.view");
  const ds = await docDuLieu(nd, (tx) => danhSachBangCong(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang
        tieuDe="Bảng công tháng"
        duongDan={[{ nhan: "Nhân sự" }]}
        moTa="Nhân sự sinh bảng công nháp; mỗi người xem dòng của mình và phản hồi trong hạn; Nhân sự giải quyết rồi khóa. Bảng đã khóa không sửa được — sai sót sau đó vào dòng điều chỉnh của kỳ sau."
        hanhDong={coQuyen(nd.hoSo, "cham_cong.update") && <TacVuBangCong />}
      />
      <section className="the">
        {ds.length === 0 ? (
          <TrongRong tieuDe="Chưa có bảng công nào">Nhân sự bấm &quot;Sinh bảng công&quot; để lập bảng nháp cho một tháng.</TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead><tr><th>Kỳ</th><th>Trạng thái</th><th>Sinh lúc</th><th>Hạn phản hồi</th><th className="so">Phản hồi chưa giải quyết</th><th>Khóa lúc</th></tr></thead>
              <tbody>
                {ds.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/cham-cong/bang-cong/${b.id}`}>Tháng {b.thang}/{b.nam}</Link></td>
                    <td><span className={`huy-hieu ${b.trangThai === "da-khoa" ? "tot" : "canh-bao"}`}>{b.trangThai === "da-khoa" ? "Đã khóa" : "Nháp"}</span></td>
                    <td>{dinhDangNgayGio(b.sinhLuc)}</td>
                    <td>{dinhDangNgayGio(b.hanPhanHoi)}</td>
                    <td className="so">{b.phanHoiMo}</td>
                    <td>{b.khoaLuc ? dinhDangNgayGio(b.khoaLuc) : "—"}</td>
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
