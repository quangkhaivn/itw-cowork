import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { tien } from "@/components/luong/doc-luong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { phieuLuongCuaToi } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

/** Phiếu lương của tôi (LU-42): chỉ các kỳ đã khóa. Không cần 2 lớp. */
export default async function TrangPhieuCuaToi() {
  const nd = await yeuCauQuyen("luong.view");
  const ds = await docDuLieu(nd, (tx) => phieuLuongCuaToi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang tieuDe="Phiếu lương của tôi" moTa="Phiếu lương hiện khi bảng lương tháng đã được Giám đốc duyệt và khóa. Thắc mắc về số liệu: liên hệ Kế toán — sai sót được điều chỉnh ở kỳ sau." />
      <section className="the">
        {ds.length === 0 ? <TrongRong tieuDe="Chưa có phiếu lương nào đã khóa" /> : (
          <table className="bang bang-luong">
            <thead><tr><th>Tháng</th><th>Trạng thái</th><th className="so">Tổng thu nhập</th><th className="so">Thực lĩnh</th><th>Khóa lúc</th><th /></tr></thead>
            <tbody>{ds.map((p) => (
              <tr key={p.id}>
                <td>{p.nhan}</td><td>{p.nhanTrangThai}</td><td className="so">{tien(p.tongThuNhap)}</td><td className="so"><strong>{tien(p.thucLinh)}</strong></td>
                <td>{p.khoaLuc ? dinhDangNgayGio(p.khoaLuc) : ""}</td><td><Link className="nut nho" href={`/luong/phieu/${p.id}/in`}>Xem / in</Link></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
