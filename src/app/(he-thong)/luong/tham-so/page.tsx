import DauTrang from "@/components/ui/DauTrang";
import Can2Lop from "@/components/luong/Can2Lop";
import FormThamSo from "@/components/luong/FormThamSo";
import FormMauNganHang from "@/components/luong/FormMauNganHang";
import NutGoi from "@/components/luong/NutGoi";
import { docLuong } from "@/components/luong/doc-luong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauMotTrongCacQuyen } from "@/lib/trang";
import { homNayVN } from "@/modules/crm/chung";
import { danhSachThamSo, xemMauNganHang } from "@/modules/luong/tham-so";

export const dynamic = "force-dynamic";

/** Tham số lương có hiệu lực theo ngày (LU-10 → LU-13): lịch sử từng loại, xác nhận của kế toán, mẫu file ngân hàng. */
export default async function TrangThamSoLuong() {
  const nd = await yeuCauMotTrongCacQuyen(["luong.create", "luong.update", "luong.approve", "luong.export"]);
  const kq = await docLuong(() =>
    docDuLieu(nd, async (tx) => {
      const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
      return { ts: await danhSachThamSo(nc), mau: coQuyen(nd.hoSo, "luong.export") ? await xemMauNganHang(nc) : null };
    }),
  );
  if (kq.can2Lop) return <Can2Lop tieuDe="Tham số lương" />;
  const { ts, mau } = kq.d;
  const hn = homNayVN();
  const ngay = (s: string) => s.split("-").reverse().join("/");
  return (
    <>
      <DauTrang
        tieuDe="Tham số lương"
        duongDan={[{ nhan: "Tính lương", href: "/luong" }]}
        moTa="Tỷ lệ bảo hiểm, lương cơ sở, lương tối thiểu vùng, giảm trừ gia cảnh, biểu thuế, khấu trừ 10%, thử việc, tăng ca, hoa hồng — mỗi bộ có hiệu lực từ một ngày; kỳ lương dùng bộ hiệu lực vào ngày cuối tháng. Không sửa bộ cũ: thay đổi = nhập bộ mới."
      />
      {ts.canXacNhan.length > 0 && (
        <div className="hop-thong-bao canh-bao" role="alert">
          <strong>Cần kế toán xác nhận {ts.canXacNhan.length} bộ tham số nạp sẵn.</strong> Giá trị nạp theo hiểu biết lúc làm phần mềm (không tra cứu được văn bản). Đối chiếu văn bản pháp luật hiện hành: đúng thì bấm “Xác nhận”, sai thì “Nhập bộ mới” với cùng ngày hiệu lực. Bảng lương dùng bộ chưa xác nhận không gửi duyệt được.
        </div>
      )}
      {ts.nhom.map((n) => {
        const hienHanh = n.bo.find((b) => b.hienHanh) ?? n.bo[0];
        return (
          <section className="the" key={n.loai}>
            <div className="dau">
              <h2>{n.nhan}</h2>
              {ts.duocSua && hienHanh && <FormThamSo loai={n.loai} nhanLoai={n.nhan} giaTriDau={hienHanh.giaTri as never} homNay={hn} />}
            </div>
            <div className="cuon-ngang"><table className="bang">
              <thead><tr><th>Hiệu lực từ</th><th>Giá trị</th><th>Căn cứ / ghi chú</th><th>Nguồn</th><th>Xác nhận</th></tr></thead>
              <tbody>{n.bo.map((b) => (
                <tr key={b.id}>
                  <td>{ngay(b.hieuLucTu)} {b.hienHanh && <span className="huy-hieu tot">Đang áp dụng</span>}{b.tuongLai && <span className="huy-hieu chinh">Sắp áp dụng</span>}</td>
                  <td><code style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(b.giaTri)}</code></td>
                  <td>{b.ghiChu}</td>
                  <td>{b.nguon === "mac-dinh" ? "Nạp sẵn" : `Nhập tay — ${b.nguoiTao}`}</td>
                  <td>
                    {b.xacNhanLuc ? `${b.nguoiXacNhan} — ${dinhDangNgayGio(b.xacNhanLuc)}` : (
                      <>
                        <span className="huy-hieu canh-bao">Chưa xác nhận</span>{" "}
                        {ts.duocSua && <NutGoi url={`/api/v1/luong/tham-so/${b.id}/xac-nhan`} nhan="Xác nhận" lopNut="nut nho" xacNhan="Bạn đã đối chiếu bộ tham số này với văn bản pháp luật hiện hành?" />}
                      </>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
        );
      })}
      {mau && (
        <section className="the">
          <div className="dau"><h2>Mẫu file chi lương ngân hàng</h2></div>
          <FormMauNganHang dau={mau} />
        </section>
      )}
    </>
  );
}
