import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { luaChonNhaCungCap } from "@/modules/nha-cung-cap/service";
import { lichSuNhap } from "@/modules/san-pham/nhap-xuat";
import NhapCsv from "./NhapCsv";

export const dynamic = "force-dynamic";

const NHAN_LOAI: Record<string, string> = { "san-pham": "Danh mục sản phẩm", "gia-nha-cung-cap": "Bảng giá nhà cung cấp" };

export default async function TrangNhapCsv() {
  const nd = await yeuCauQuyen("product.update");
  const { nhaCungCap, lichSu } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      nhaCungCap: coQuyen(nd.hoSo, "supplier.view") ? await luaChonNhaCungCap(nc) : [],
      lichSu: await lichSuNhap(nc),
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Nhập CSV"
        duongDan={[{ nhan: "Sản phẩm", href: "/san-pham" }]}
        moTa="Nhập danh mục sản phẩm hoặc bảng giá của một nhà cung cấp. Hệ thống luôn cho xem trước kết quả trước khi ghi; dòng hỏng bị bỏ qua và nêu rõ lý do."
      />
      <NhapCsv nhaCungCap={nhaCungCap} />

      <section className="the">
        <div className="dau">
          <h2>Lần nhập gần đây</h2>
        </div>
        {lichSu.length === 0 ? (
          <TrongRong tieuDe="Chưa nhập tệp nào" />
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Tệp</th>
                  <th>Loại</th>
                  <th className="so">Tạo</th>
                  <th className="so">Cập nhật</th>
                  <th className="so">Hỏng</th>
                  <th className="an-tren-dt">Người nhập</th>
                </tr>
              </thead>
              <tbody>
                {lichSu.map((j) => (
                  <tr key={j.id}>
                    <td>
                      {j.tenTep}
                      <div className="dong-phu">{dinhDangNgayGio(j.luc)}</div>
                    </td>
                    <td>{NHAN_LOAI[j.loai] ?? j.loai}</td>
                    <td className="so">{j.soTao}</td>
                    <td className="so">{j.soSua}</td>
                    <td className="so">{j.soLoi ? <span className="huy-hieu loi">{j.soLoi}</span> : 0}</td>
                    <td className="an-tren-dt">{j.nguoi}</td>
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
