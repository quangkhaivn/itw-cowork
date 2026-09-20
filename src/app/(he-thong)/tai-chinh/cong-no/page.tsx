import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { congNoTheoKhach } from "@/modules/tai-chinh/service";
import { NHAN_NHOM_TUOI_NO } from "@/modules/tai-chinh/tinh-toan";

export const dynamic = "force-dynamic";

const NHOM: (keyof typeof NHAN_NHOM_TUOI_NO)[] = ["trong-han", "1-30", "31-60", "61-90", "tren-90"];

export default async function TrangCongNo() {
  const nd = await yeuCauQuyen("finance.view");
  const kq = await docDuLieu(nd, (tx) => congNoTheoKhach(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));

  return (
    <>
      <DauTrang
        tieuDe="Công nợ phải thu"
        duongDan={[{ nhan: "Tài chính" }]}
        moTa="Ai đang nợ bao nhiêu, quá hạn bao lâu. Số liệu tính từ hóa đơn đã phát hành trừ tiền đã thu, không lưu riêng nên luôn khớp."
        hanhDong={
          <Link className="nut" href="/tai-chinh/hoa-don?trangThai=qua-han">
            Hóa đơn quá hạn
          </Link>
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Tổng còn phải thu</div>
          <div className="gia-tri">{dinhDangTien(kq.tomTat.tongConNo)}</div>
        </div>
        <div className={`the chi-so${kq.tomTat.tongQuaHan > 0 ? " loi" : ""}`}>
          <div className="nhan">Quá hạn</div>
          <div className="gia-tri">{dinhDangTien(kq.tomTat.tongQuaHan)}</div>
          <div className="ghi-chu">{dinhDangSo(kq.tomTat.soHoaDonQuaHan)} hóa đơn</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Số khách đang nợ</div>
          <div className="gia-tri">{dinhDangSo(kq.khach.length)}</div>
          <div className="ghi-chu">
            {kq.nguongCanhBao === null ? (
              <>
                Chưa đặt ngưỡng cảnh báo. <Link href="/quan-tri/cau-hinh">Đặt ở Cấu hình</Link>
              </>
            ) : (
              `Cảnh báo khi quá hạn trên ${kq.nguongCanhBao} ngày`
            )}
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
          <h2>Công nợ theo khách</h2>
        </div>
        {kq.khach.length === 0 ? (
          <TrongRong tieuDe="Không có khách nào đang nợ">Mọi hóa đơn đã phát hành đều đã thu đủ.</TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th className="so">Còn nợ</th>
                  <th className="so">Trong đó quá hạn</th>
                  <th className="so an-tren-dt">Số hóa đơn</th>
                  <th className="an-tren-dt">Quá hạn lâu nhất</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {kq.khach.map((k) => (
                  <tr key={k.khachHang.id}>
                    <td>
                      <Link href={`/crm/khach-hang/${k.khachHang.id}`}>{k.khachHang.ten}</Link>
                      <div className="dong-phu">{k.khachHang.ma}</div>
                    </td>
                    <td className="so">
                      <strong>{dinhDangTien(k.conNo)}</strong>
                    </td>
                    <td className="so">
                      {k.quaHan > 0 ? <span className="chu-loi">{dinhDangTien(k.quaHan)}</span> : <span className="mo">—</span>}
                    </td>
                    <td className="so an-tren-dt nho">{dinhDangSo(k.soHoaDon)}</td>
                    <td className="an-tren-dt nho">
                      {k.quaHanLauNhat > 0 ? (
                        <span className={kq.nguongCanhBao !== null && k.quaHanLauNhat > kq.nguongCanhBao ? "chu-loi" : undefined}>{dinhDangSo(k.quaHanLauNhat)} ngày</span>
                      ) : (
                        <span className="mo">còn hạn</span>
                      )}
                    </td>
                    <td>
                      <Link className="nut trong nho" href={`/tai-chinh/hoa-don?khachHang=${k.khachHang.id}&trangThai=con-no`}>
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
