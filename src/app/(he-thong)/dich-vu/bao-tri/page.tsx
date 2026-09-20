import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocBaoTri } from "@/modules/bao-tri/luoc-do";
import { danhSachHopDongBaoTri, NHAN_TINH_TRANG_KY, NHAN_TRANG_THAI_BAO_TRI } from "@/modules/bao-tri/service";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANG_THAI = ["hieu-luc", "tam-dung", "het-han", "huy"];

export default async function TrangBaoTri({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("service_desk.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocBaoTri.parse({
    q: layMot(sp.q),
    // "hieu-luc" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "hieu-luc" ? "" : tt === "tat-ca" || tt === "den-ky" || TRANG_THAI.includes(tt) ? tt : "",
    khachHang: LA_UUID.test(layMot(sp.khachHang)) ? layMot(sp.khachHang) : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachHopDongBaoTri(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.khachHang);
  const toiKy = kq.dong.filter((h) => h.tinhTrangKy === "den-ky" || h.tinhTrangKy === "tre-ky").length;

  return (
    <>
      <DauTrang
        tieuDe="Hợp đồng bảo trì"
        duongDan={[{ nhan: "Dịch vụ" }]}
        moTa="Bảo trì định kỳ theo chu kỳ tháng. Tới kỳ thì bản quét nhắc người phụ trách; ghi nhận xong một kỳ là mốc kỳ sau tự đẩy lên."
        hanhDong={
          coQuyen(nd.hoSo, "service_desk.create") && (
            <Link className="nut chinh" href="/dich-vu/bao-tri/moi">
              <BieuTuong ten="them" co={16} /> Lập hợp đồng
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className={`the chi-so ${toiKy > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Tới kỳ / trễ kỳ (trang này)</div>
          <div className="gia-tri">{dinhDangSo(toiKy)}</div>
          <div className="ghi-chu">
            <Link href="/dich-vu/bao-tri?trangThai=den-ky">Chỉ xem hợp đồng tới kỳ</Link>
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Tổng hợp đồng khớp bộ lọc</div>
          <div className="gia-tri">{dinhDangSo(kq.tong)}</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Mã hợp đồng, tên hợp đồng, tên khách" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "hieu-luc"}>
              <option value="hieu-luc">Đang hiệu lực</option>
              <option value="den-ky">Tới kỳ bảo trì</option>
              <option value="tam-dung">Tạm dừng</option>
              <option value="het-han">Hết hạn</option>
              <option value="huy">Đã hủy</option>
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/dich-vu/bao-tri">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có hợp đồng nào khớp bộ lọc" : "Chưa có hợp đồng bảo trì nào"}>
            {!coLoc && "Lập hợp đồng bảo trì định kỳ để hệ thống nhắc đúng kỳ, không phải nhớ bằng đầu."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Hợp đồng</th>
                  <th>Khách hàng</th>
                  <th className="an-tren-dt">Chu kỳ</th>
                  <th>Kỳ kế tiếp</th>
                  <th className="an-tren-dt">Phụ trách</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <Link href={`/dich-vu/bao-tri/${h.id}`}>
                        <strong>{h.ma}</strong>
                      </Link>
                      <div className="dong-phu">{h.ten}</div>
                    </td>
                    <td>
                      <Link href={`/crm/khach-hang/${h.khachHang.id}`}>{h.khachHang.ten}</Link>
                    </td>
                    <td className="an-tren-dt nho">{h.chuKyThang} tháng</td>
                    <td className="nho">
                      {h.kyKeTiep ? (
                        <>
                          {dinhDangNgay(h.kyKeTiep)}
                          <div className="dong-phu">
                            <span className={NHAN_TINH_TRANG_KY[h.tinhTrangKy]?.lop === "loi" ? "chu-loi" : undefined}>
                              {NHAN_TINH_TRANG_KY[h.tinhTrangKy]?.nhan ?? h.tinhTrangKy}
                            </span>
                            {h.soNgayToiKy !== null && h.soNgayToiKy > 0 && ` · còn ${h.soNgayToiKy} ngày`}
                          </div>
                        </>
                      ) : (
                        <span className="phu">Hết kỳ hạn</span>
                      )}
                    </td>
                    <td className="an-tren-dt nho">{h.nguoiPhuTrach.hoTen}</td>
                    <td>
                      <span className={`huy-hieu ${NHAN_TRANG_THAI_BAO_TRI[h.trangThai]?.lop ?? ""}`}>
                        {NHAN_TRANG_THAI_BAO_TRI[h.trangThai]?.nhan ?? h.trangThai}
                      </span>
                      {h.giaTri && <div className="dong-phu">{dinhDangTien(h.giaTri)}</div>}
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
          duongDan="/dich-vu/bao-tri"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "hieu-luc", khachHang: boLoc.khachHang }}
        />
      </section>
    </>
  );
}
