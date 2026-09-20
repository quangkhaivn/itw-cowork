import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocHoaDon } from "@/modules/tai-chinh/luoc-do";
import { danhSachHoaDon } from "@/modules/tai-chinh/service";
import { NHAN_NHOM_TUOI_NO, NHAN_TINH_TRANG_THU, NHAN_TRANG_THAI_HOA_DON, TRANG_THAI_HOA_DON } from "@/modules/tai-chinh/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangHoaDon({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("finance.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocHoaDon.parse({
    q: layMot(sp.q),
    // "con-no" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "con-no" ? "" : tt === "tat-ca" || tt === "qua-han" || (TRANG_THAI_HOA_DON as readonly string[]).includes(tt) ? tt : "",
    khachHang: LA_UUID.test(layMot(sp.khachHang)) ? layMot(sp.khachHang) : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachHoaDon(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.khachHang);

  return (
    <>
      <DauTrang
        tieuDe="Hóa đơn"
        duongDan={[{ nhan: "Tài chính" }]}
        moTa="Hóa đơn lập từ đơn hàng đã xác nhận. Công nợ được tính từ hóa đơn trừ tiền đã thu — không lưu thành con số riêng nên không bao giờ lệch."
        hanhDong={
          coQuyen(nd.hoSo, "finance.create") && (
            <Link className="nut chinh" href="/tai-chinh/hoa-don/moi">
              <BieuTuong ten="them" co={16} /> Lập hóa đơn
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Tổng còn nợ</div>
          <div className="gia-tri">{dinhDangTien(kq.tomTat.tongConNo)}</div>
        </div>
        <div className={`the chi-so${kq.tomTat.tongQuaHan > 0 ? " loi" : ""}`}>
          <div className="nhan">Trong đó quá hạn</div>
          <div className="gia-tri">{dinhDangTien(kq.tomTat.tongQuaHan)}</div>
          <div className="ghi-chu">
            {kq.tomTat.soHoaDonQuaHan > 0 ? <Link href="/tai-chinh/hoa-don?trangThai=qua-han">{dinhDangSo(kq.tomTat.soHoaDonQuaHan)} hóa đơn quá hạn</Link> : "Không có hóa đơn quá hạn"}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Nợ trên 90 ngày</div>
          <div className="gia-tri">{dinhDangTien(kq.tomTat.theoNhom["tren-90"])}</div>
          <div className="ghi-chu">
            <Link href="/tai-chinh/cong-no">Xem công nợ theo khách</Link>
          </div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số hóa đơn, tên khách hàng" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "con-no"}>
              <option value="con-no">Còn nợ</option>
              <option value="qua-han">Quá hạn</option>
              <option value="tat-ca">Tất cả</option>
              {TRANG_THAI_HOA_DON.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_HOA_DON[t]}
                </option>
              ))}
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/tai-chinh/hoa-don">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có hóa đơn khớp bộ lọc" : "Chưa có hóa đơn nào"}>
            {!coLoc && "Xác nhận đơn hàng rồi bấm “Xuất hóa đơn” ngay trên đơn — dòng hàng và số tiền chép sang."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Hóa đơn</th>
                  <th>Khách hàng</th>
                  <th>Trạng thái</th>
                  <th className="so">Tổng tiền</th>
                  <th className="so">Còn nợ</th>
                  <th className="an-tren-dt">Hạn thanh toán</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((hd) => {
                  const thu = NHAN_TINH_TRANG_THU[hd.tinhTrangThu];
                  const tuoi = NHAN_NHOM_TUOI_NO[hd.nhomTuoiNo as keyof typeof NHAN_NHOM_TUOI_NO];
                  return (
                    <tr key={hd.id}>
                      <td>
                        <Link href={`/tai-chinh/hoa-don/${hd.id}`}>{hd.so}</Link>
                        <div className="dong-phu">
                          {hd.ngayPhatHanh ? dinhDangNgay(hd.ngayPhatHanh) : "chưa phát hành"}
                          {hd.donHang && ` · từ ${hd.donHang.so}`}
                        </div>
                      </td>
                      <td>
                        <Link href={`/crm/khach-hang/${hd.khachHang.id}`}>{hd.khachHang.ten}</Link>
                      </td>
                      <td>
                        <span className={`huy-hieu ${hd.trangThai === "ISSUED" ? "chinh" : hd.trangThai === "CANCELLED" ? "loi" : ""}`}>
                          {NHAN_TRANG_THAI_HOA_DON[hd.trangThai] ?? hd.trangThai}
                        </span>
                        {hd.trangThai === "ISSUED" && <div className="dong-phu">{thu.nhan}</div>}
                      </td>
                      <td className="so">{dinhDangTien(hd.tongCong)}</td>
                      <td className="so">
                        {hd.conNo > 0 ? <strong>{dinhDangTien(hd.conNo)}</strong> : <span className="mo">—</span>}
                        {hd.daThu > 0 && hd.conNo > 0 && <div className="dong-phu">đã thu {dinhDangTien(hd.daThu)}</div>}
                      </td>
                      <td className="an-tren-dt so nho">
                        {hd.hanThanhToan ? dinhDangNgay(hd.hanThanhToan) : "—"}
                        {hd.conNo > 0 && hd.soNgayQuaHan > 0 && <div className={`dong-phu ${tuoi.lop === "loi" ? "chu-loi" : ""}`}>quá hạn {dinhDangSo(hd.soNgayQuaHan)} ngày</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/tai-chinh/hoa-don" thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "con-no", khachHang: boLoc.khachHang }} />
      </section>
    </>
  );
}
