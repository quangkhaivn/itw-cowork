import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocHoaDonMua } from "@/modules/cong-no-tra/luoc-do";
import { danhSachHoaDonMua, NHAN_TINH_TRANG_TRA, NHAN_TRANG_THAI_HOA_DON_MUA } from "@/modules/cong-no-tra/service";
import { NHAN_NHOM_TUOI_NO } from "@/modules/tai-chinh/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANG_THAI = ["DRAFT", "RECORDED", "CANCELLED"];

export default async function TrangHoaDonMua({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("finance.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocHoaDonMua.parse({
    q: layMot(sp.q),
    // "con-no" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "con-no" ? "" : tt === "tat-ca" || tt === "qua-han" || TRANG_THAI.includes(tt) ? tt : "",
    nhaCungCap: LA_UUID.test(layMot(sp.nhaCungCap)) ? layMot(sp.nhaCungCap) : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachHoaDonMua(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.nhaCungCap);
  const tongConNo = kq.dong.reduce((s, h) => s + h.conNo, 0);
  const soQuaHan = kq.dong.filter((h) => h.conNo > 0 && h.soNgayQuaHan > 0).length;

  return (
    <>
      <DauTrang
        tieuDe="Hóa đơn nhà cung cấp"
        duongDan={[{ nhan: "Tài chính" }]}
        moTa="Hóa đơn nhà cung cấp gửi tới, lập từ đơn mua hoặc nhập tay. Nợ phải trả được tính từ hóa đơn đã ghi nhận trừ tiền đã chi — không lưu thành con số riêng."
        hanhDong={
          <Link className="nut" href="/tai-chinh/cong-no-tra">
            Xem công nợ phải trả
          </Link>
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Còn phải trả (trang này)</div>
          <div className="gia-tri">{dinhDangTien(tongConNo)}</div>
        </div>
        <div className={`the chi-so ${soQuaHan > 0 ? "loi" : ""}`}>
          <div className="nhan">Hóa đơn quá hạn</div>
          <div className="gia-tri">{dinhDangSo(soQuaHan)}</div>
          <div className="ghi-chu">
            <Link href="/tai-chinh/hoa-don-mua?trangThai=qua-han">Chỉ xem hóa đơn quá hạn</Link>
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Tổng khớp bộ lọc</div>
          <div className="gia-tri">{dinhDangSo(kq.tong)}</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số hóa đơn, số của nhà cung cấp, tên nhà cung cấp" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "con-no"}>
              <option value="con-no">Còn nợ</option>
              <option value="qua-han">Quá hạn</option>
              <option value="DRAFT">Nháp</option>
              <option value="RECORDED">Đã ghi nhận</option>
              <option value="CANCELLED">Đã hủy</option>
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/tai-chinh/hoa-don-mua">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có hóa đơn nào khớp bộ lọc" : "Không còn hóa đơn nào phải trả"}>
            {!coLoc && "Lập hóa đơn từ màn hình Đơn mua khi nhà cung cấp gửi hóa đơn tới."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Hóa đơn</th>
                  <th>Nhà cung cấp</th>
                  <th className="so">Tổng tiền</th>
                  <th className="so">Còn nợ</th>
                  <th className="an-tren-dt">Hạn</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <Link href={`/tai-chinh/hoa-don-mua/${h.id}`}>
                        <strong>{h.so}</strong>
                      </Link>
                      {h.soHoaDonNcc && <div className="dong-phu">{h.soHoaDonNcc}</div>}
                      {h.donMua && (
                        <div className="dong-phu">
                          từ <Link href={`/mua-hang/don-mua/${h.donMua.id}`}>{h.donMua.so}</Link>
                        </div>
                      )}
                    </td>
                    <td>{h.nhaCungCap.ten}</td>
                    <td className="so">{dinhDangTien(h.tongCong)}</td>
                    <td className="so">
                      <strong>{dinhDangTien(h.conNo)}</strong>
                      <div className="dong-phu">{NHAN_TINH_TRANG_TRA[h.tinhTrangTra] ?? h.tinhTrangTra}</div>
                    </td>
                    <td className="an-tren-dt nho">
                      {h.hanThanhToan ? dinhDangNgay(h.hanThanhToan) : <span className="phu">—</span>}
                      {h.conNo > 0 && h.soNgayQuaHan > 0 && (
                        <div className="dong-phu chu-loi">{NHAN_NHOM_TUOI_NO[h.nhomTuoiNo as keyof typeof NHAN_NHOM_TUOI_NO]?.nhan}</div>
                      )}
                    </td>
                    <td>
                      <span className={`huy-hieu ${NHAN_TRANG_THAI_HOA_DON_MUA[h.trangThai]?.lop ?? ""}`}>
                        {NHAN_TRANG_THAI_HOA_DON_MUA[h.trangThai]?.nhan ?? h.trangThai}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang
          tong={kq.tong}
          trang={kq.trang}
          coTrang={kq.coTrang}
          duongDan="/tai-chinh/hoa-don-mua"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "con-no", nhaCungCap: boLoc.nhaCungCap }}
        />
      </section>
    </>
  );
}
