import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { NHAN_DOI_TUONG_PHAN_KHUC } from "@/modules/marketing/hang-so";
import { danhSachPhanKhuc } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export default async function TrangPhanKhuc() {
  const nd = await yeuCauQuyen("marketing.view");
  const ds = await docDuLieu(nd, (tx) => danhSachPhanKhuc(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  return (
    <>
      <DauTrang
        tieuDe="Phân khúc"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Tệp lead hoặc liên hệ khách theo điều kiện. Con số tính lại mỗi lần mở. Danh sách gửi tin chỉ gồm người đã đồng ý và chưa từ chối nhận tin."
        hanhDong={
          coQuyen(nd.hoSo, "marketing.create") && (
            <Link className="nut chinh" href="/marketing/phan-khuc/moi">
              <BieuTuong ten="them" co={16} /> Tạo phân khúc
            </Link>
          )
        }
      />
      <section className="the">
        {ds.length === 0 ? (
          <TrongRong tieuDe="Chưa có phân khúc nào" />
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Phân khúc</th>
                  <th>Đối tượng</th>
                  <th className="so">Khớp</th>
                  <th className="so">Nhận được tin</th>
                  <th className="an-tren-dt">Người tạo</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/marketing/phan-khuc/${p.id}`}>{p.ten}</Link>
                      <div className="dong-phu">sửa {dinhDangNgay(p.suaLuc)}</div>
                    </td>
                    <td>{NHAN_DOI_TUONG_PHAN_KHUC[p.doiTuong]}</td>
                    <td className="so">{p.dem ? dinhDangSo(p.dem.tong) : <span className="huy-hieu loi">Điều kiện hỏng</span>}</td>
                    <td className="so">{p.dem ? dinhDangSo(p.dem.nhanDuoc) : "—"}</td>
                    <td className="an-tren-dt">{p.nguoiPhuTrach.hoTen}</td>
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
