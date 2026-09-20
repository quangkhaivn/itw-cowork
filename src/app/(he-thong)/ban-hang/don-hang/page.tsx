import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { LuocDoLocDon } from "@/modules/don-hang/luoc-do";
import { danhSachDonHang } from "@/modules/don-hang/service";
import { LOP_TRANG_THAI_DON, NHAN_TRANG_THAI_DON, TRANG_THAI_DON } from "@/modules/don-hang/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangDonHang({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("order.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocDon.parse({
    q: layMot(sp.q),
    // "dang-chay" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "dang-chay" ? "" : tt === "tat-ca" || (TRANG_THAI_DON as readonly string[]).includes(tt) ? tt : "",
    nguoiPhuTrach: LA_UUID.test(layMot(sp.nguoiPhuTrach)) ? layMot(sp.nguoiPhuTrach) : "",
    conPhaiGiao: layMot(sp.conPhaiGiao) === "1" ? "1" : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, nguoi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { kq: await danhSachDonHang(nc, boLoc), nguoi: await danhSachNguoiPhuTrach(nc, "order.view") };
  });
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.nguoiPhuTrach || boLoc.conPhaiGiao);

  return (
    <>
      <DauTrang
        tieuDe="Đơn hàng"
        duongDan={[{ nhan: "Bán hàng" }]}
        moTa="Đơn sinh từ báo giá khách đã chấp nhận. Xác nhận đơn là giữ hàng trong kho; xuất hàng trừ tồn và ghi thẻ kho."
        hanhDong={
          coQuyen(nd.hoSo, "order.create") && (
            <Link className="nut chinh" href="/ban-hang/don-hang/moi">
              <BieuTuong ten="them" co={16} /> Tạo đơn hàng
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Đơn đang chạy</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.soDangChay)}</div>
          <div className="ghi-chu">{dinhDangTien(kq.tomTat.giaTriDangChay)}</div>
        </div>
        <div className={`the chi-so${kq.tomTat.soChoGiao > 0 ? " canh-bao" : ""}`}>
          <div className="nhan">Chờ giao hàng</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.soChoGiao)}</div>
          <div className="ghi-chu">
            {kq.tomTat.soChoGiao > 0 ? <Link href="/ban-hang/don-hang?conPhaiGiao=1">Xem đơn còn hàng chưa giao</Link> : "Không còn đơn nào chờ giao"}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Đã giao đủ</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.soDaGiao)}</div>
          <div className="ghi-chu">{dinhDangTien(kq.tomTat.giaTriDaGiao)}</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số đơn, tên khách hàng" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-chay"}>
              <option value="dang-chay">Đang chạy</option>
              <option value="tat-ca">Tất cả</option>
              {TRANG_THAI_DON.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_DON[t]}
                </option>
              ))}
            </select>
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiPhuTrach">Người phụ trách</label>
              <select id="nguoiPhuTrach" name="nguoiPhuTrach" defaultValue={boLoc.nguoiPhuTrach}>
                <option value="">Tất cả</option>
                {nguoi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="truong">
            <label className="o-chon" style={{ minHeight: 34, alignItems: "center" }}>
              <input type="checkbox" name="conPhaiGiao" value="1" defaultChecked={boLoc.conPhaiGiao === "1"} />
              <span>Còn hàng chưa giao</span>
            </label>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/ban-hang/don-hang">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có đơn khớp bộ lọc" : "Chưa có đơn hàng nào"}>
            {!coLoc && "Chốt một báo giá rồi bấm “Tạo đơn hàng” ngay trên báo giá đó — dòng hàng và số tiền chép sang, không phải nhập lại."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Đơn hàng</th>
                  <th>Khách hàng</th>
                  <th>Trạng thái</th>
                  <th className="so">Giá trị</th>
                  <th className="an-tren-dt">Tiến độ giao</th>
                  <th className="an-tren-dt">Giao dự kiến</th>
                  <th>Phụ trách</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/ban-hang/don-hang/${d.id}`}>{d.so}</Link>
                      <div className="dong-phu">
                        {dinhDangNgay(d.ngayDat)}
                        {d.baoGia && ` · từ ${d.baoGia.so}`}
                      </div>
                    </td>
                    <td>
                      <Link href={`/crm/khach-hang/${d.khachHang.id}`}>{d.khachHang.ten}</Link>
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_DON[d.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_DON[d.trangThai] ?? d.trangThai}</span>
                    </td>
                    <td className="so">{dinhDangTien(d.tongCong)}</td>
                    <td className="an-tren-dt nho">
                      {d.trangThai === "CANCELLED" ? (
                        <span className="mo">—</span>
                      ) : (
                        <>
                          {d.tienDo.phanTram}%
                          <div className="dong-phu">
                            {d.tienDo.conLai > 0 ? `còn ${dinhDangSo(d.tienDo.conLai)} chưa giao` : "đã giao đủ"}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="an-tren-dt so nho">{d.ngayGiaoDuKien ? dinhDangNgay(d.ngayGiaoDuKien) : "—"}</td>
                    <td>{d.nguoiPhuTrach.hoTen}</td>
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
          duongDan="/ban-hang/don-hang"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-chay", nguoiPhuTrach: boLoc.nguoiPhuTrach, conPhaiGiao: boLoc.conPhaiGiao }}
        />
      </section>
    </>
  );
}
