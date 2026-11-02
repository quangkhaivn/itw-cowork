import Link from "next/link";
import { redirect } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import Can2Lop from "@/components/luong/Can2Lop";
import { docLuong, tien } from "@/components/luong/doc-luong";
import { taoNguCanh } from "@/lib/api";
import { coMotTrongCacQuyen, coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { homNayVN } from "@/modules/crm/chung";
import { danhSachKyLuong } from "@/modules/luong/service";
import { danhSachThamSo } from "@/modules/luong/tham-so";

export const dynamic = "force-dynamic";

const LOP: Record<string, string> = { nhap: "", "cho-duyet": "canh-bao", "da-duyet": "chinh", "da-khoa": "tot", "da-chi": "tot" };

/** Tính lương (LU-20): danh sách kỳ lương, trạng thái, tổng hợp. Mỗi lần mở ghi nhật ký xem (LU-62). */
export default async function TrangLuong() {
  const nd = await yeuCauQuyen("luong.view");
  // Chỉ xem phiếu của mình (phạm vi own) → sang trang phiếu của tôi.
  const pv = nd.hoSo.phamVi.get("luong.view");
  if (!pv || pv === "own") redirect("/luong/phieu-cua-toi");
  const kq = await docLuong(() =>
    docDuLieu(nd, async (tx) => {
      const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
      const ky = await danhSachKyLuong(nc);
      const ts = coMotTrongCacQuyen(nd.hoSo, ["luong.create", "luong.update", "luong.approve", "luong.export"]) ? await danhSachThamSo(nc) : null;
      return { ky, canXacNhan: ts?.canXacNhan ?? [] };
    }),
  );
  if (kq.can2Lop) return <Can2Lop />;
  const d = kq.d;
  const hn = homNayVN();
  return (
    <>
      <DauTrang
        tieuDe="Tính lương"
        moTa="Mỗi tháng: Nhân sự khóa bảng công → Kế toán tính và kiểm → gửi duyệt → Giám đốc duyệt → khóa → chi lương. Kỳ đã khóa không sửa được; sai sót sửa bằng khoản điều chỉnh ở kỳ sau."
        hanhDong={
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Link className="nut" href="/luong/ho-so">Hồ sơ lương</Link>
            <Link className="nut" href="/luong/tham-so">Tham số</Link>
            <Link className="nut" href="/luong/phieu-cua-toi">Phiếu của tôi</Link>
            {coQuyen(nd.hoSo, "luong.create") && (
              <FormNhanh nhanNut="Tạo kỳ lương" tieuDe="Tạo kỳ lương tháng" url="/api/v1/luong/ky" lopNut="nut chinh"
                truong={[
                  { ten: "nam", nhan: "Năm", kieu: "number", batBuoc: true },
                  { ten: "thang", nhan: "Tháng (1–12)", kieu: "number", batBuoc: true, goiY: "Chỉ tính được khi bảng công tháng đó đã khóa." },
                ]}
                giaTriDau={{ nam: Number(hn.slice(0, 4)), thang: Number(hn.slice(5, 7)) }} />
            )}
          </span>
        }
      />
      {d.canXacNhan.length > 0 && (
        <div className="hop-thong-bao canh-bao" role="alert">
          <strong>Tham số lương cần kế toán xác nhận:</strong> {d.canXacNhan.map((b) => `${b.nhan} (từ ${b.hieuLucTu.split("-").reverse().join("/")})`).join("; ")}.
          {" "}Giá trị nạp sẵn theo hiểu biết lúc làm phần mềm — đối chiếu văn bản pháp luật hiện hành rồi xác nhận ở <Link href="/luong/tham-so">Tham số</Link>. Chưa xác nhận thì không gửi duyệt được bảng lương.
        </div>
      )}
      <section className="the">
        <div className="dau"><h2>Kỳ lương</h2></div>
        {d.ky.length === 0 ? <TrongRong tieuDe="Chưa có kỳ lương nào"><p>Tạo kỳ lương cho tháng có bảng công đã khóa.</p></TrongRong> : (
          <div className="cuon-ngang"><table className="bang bang-luong">
            <thead><tr><th>Kỳ</th><th>Trạng thái</th><th className="so">Số người</th><th className="so">Tổng thu nhập</th><th className="so">Thuế TNCN</th><th className="so">Thực lĩnh</th><th className="so">BH doanh nghiệp</th><th>Ghi chú</th></tr></thead>
            <tbody>{d.ky.map((k) => (
              <tr key={k.id}>
                <td><Link href={`/luong/${k.id}`}>{k.nhan}</Link></td>
                <td><span className={`huy-hieu ${LOP[k.trangThai] ?? ""}`}>{k.nhanTrangThai}</span></td>
                <td className="so">{k.soNguoi}</td><td className="so">{tien(k.tongThuNhap)}</td><td className="so">{tien(k.tongThue)}</td>
                <td className="so">{tien(k.tongThucLinh)}</td><td className="so">{tien(k.tongBhDn)}</td>
                <td>{k.soLoi > 0 && <span className="huy-hieu loi">{k.soLoi} dòng lỗi</span>} {k.trangThai === "nhap" && k.canTinhLai && <span className="huy-hieu canh-bao">Cần tính lại</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
