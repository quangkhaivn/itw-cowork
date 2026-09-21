import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { congNoTheoNhaCungCap } from "@/modules/cong-no-tra/service";
import { NHAN_NHOM_TUOI_NO } from "@/modules/tai-chinh/tinh-toan";

export const dynamic = "force-dynamic";

const NHOM: (keyof typeof NHAN_NHOM_TUOI_NO)[] = ["trong-han", "1-30", "31-60", "61-90", "tren-90"];

/**
 * Công nợ phải trả — đối xứng với màn hình Công nợ (phải thu) của Phase 7, và dùng
 * chung đúng những hàm tính tuổi nợ đó.
 */
export default async function TrangCongNoTra() {
  const nd = await yeuCauQuyen("finance.view");
  const kq = await docDuLieu(nd, (tx) => congNoTheoNhaCungCap(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));

  return (
    <>
      <DauTrang
        tieuDe="Công nợ phải trả"
        duongDan={[{ nhan: "Tài chính" }]}
        moTa="Mình đang nợ ai bao nhiêu, quá hạn bao lâu. Số liệu tính từ hóa đơn đã ghi nhận trừ tiền đã chi, không lưu riêng nên luôn khớp."
        hanhDong={
          <Link className="nut" href="/tai-chinh/hoa-don-mua?trangThai=qua-han">
            Hóa đơn quá hạn
          </Link>
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Tổng còn phải trả</div>
          <div className="gia-tri">{dinhDangTien(kq.tomTat.tongConNo)}</div>
        </div>
        <div className={`the chi-so ${kq.tomTat.tongQuaHan > 0 ? "loi" : ""}`}>
          <div className="nhan">Quá hạn</div>
          <div className="gia-tri">{dinhDangTien(kq.tomTat.tongQuaHan)}</div>
          <div className="ghi-chu">{dinhDangSo(kq.tomTat.soHoaDonQuaHan)} hóa đơn</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Số nhà cung cấp đang nợ</div>
          <div className="gia-tri">{dinhDangSo(kq.nhaCungCap.length)}</div>
          <div className="ghi-chu">
            <Link href="/tai-chinh/phieu-chi">Xem phiếu chi</Link>
          </div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Tuổi nợ</h2>
        </div>
        <table className="bang">
          <thead>
            <tr>
              {NHOM.map((n) => (
                <th key={n} className="so">
                  {NHAN_NHOM_TUOI_NO[n].nhan}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {NHOM.map((n) => (
                <td key={n} className="so">
                  <span className={NHAN_NHOM_TUOI_NO[n].lop === "loi" && kq.tomTat.theoNhom[n] > 0 ? "chu-loi" : undefined}>
                    {dinhDangTien(kq.tomTat.theoNhom[n])}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      <section className="the">
        <div className="dau">
          <h2>Công nợ theo nhà cung cấp</h2>
        </div>
        {kq.nhaCungCap.length === 0 ? (
          <TrongRong tieuDe="Không nợ nhà cung cấp nào">Mọi hóa đơn đã ghi nhận đều đã trả đủ.</TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Nhà cung cấp</th>
                  <th className="so">Còn nợ</th>
                  <th className="so">Trong đó quá hạn</th>
                  <th className="so an-tren-dt">Số hóa đơn</th>
                  <th className="an-tren-dt">Quá hạn lâu nhất</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {kq.nhaCungCap.map((n) => (
                  <tr key={n.nhaCungCap.id}>
                    <td>
                      <Link href={`/san-pham/nha-cung-cap/${n.nhaCungCap.id}`}>{n.nhaCungCap.ten}</Link>
                      <div className="dong-phu">{n.nhaCungCap.ma}</div>
                    </td>
                    <td className="so">
                      <strong>{dinhDangTien(n.conNo)}</strong>
                    </td>
                    <td className="so">
                      {n.quaHan > 0 ? <span className="chu-loi">{dinhDangTien(n.quaHan)}</span> : <span className="mo">—</span>}
                    </td>
                    <td className="so an-tren-dt nho">{dinhDangSo(n.soHoaDon)}</td>
                    <td className="an-tren-dt nho">
                      {n.quaHanLauNhat > 0 ? (
                        <span className="chu-loi">{dinhDangSo(n.quaHanLauNhat)} ngày</span>
                      ) : (
                        <span className="mo">còn hạn</span>
                      )}
                    </td>
                    <td>
                      <Link className="nut trong nho" href={`/tai-chinh/hoa-don-mua?nhaCungCap=${n.nhaCungCap.id}`}>
                        Xem hóa đơn
                      </Link>
                    </td>
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
