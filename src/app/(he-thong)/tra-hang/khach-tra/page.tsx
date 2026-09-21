import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coMotTrongCacQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauMotTrongCacQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocTraHangBan } from "@/modules/tra-hang/luoc-do";
import { danhSachTraHangBan } from "@/modules/tra-hang/service";
import {
  LOP_TRANG_THAI_TRA_HANG,
  NHAN_LOAI_TRA_HANG,
  NHAN_TINH_TRANG_HANG,
  NHAN_TRANG_THAI_TRA_BAN,
} from "@/modules/tra-hang/tinh-toan";

export const dynamic = "force-dynamic";

const QUYEN_XEM = ["order.view", "service_desk.view", "finance.view"];
const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANG_THAI = ["DRAFT", "CONFIRMED", "SETTLED", "CANCELLED"];

export default async function TrangKhachTraHang({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauMotTrongCacQuyen(QUYEN_XEM);
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocTraHangBan.parse({
    q: layMot(sp.q),
    // "dang-mo" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "dang-mo" ? "" : tt === "tat-ca" || TRANG_THAI.includes(tt) ? tt : "",
    loai: ["tra-hang", "doi-may"].includes(layMot(sp.loai)) ? layMot(sp.loai) : "",
    khachHang: LA_UUID.test(layMot(sp.khachHang)) ? layMot(sp.khachHang) : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachTraHangBan(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.loai || boLoc.khachHang);
  const duocLap = coMotTrongCacQuyen(nd.hoSo, ["order.update", "service_desk.update"]);

  return (
    <>
      <DauTrang
        tieuDe="Khách trả hàng"
        duongDan={[{ nhan: "Trả hàng" }]}
        moTa="Khách trả lại hàng hoặc đổi máy trong bảo hành. Hàng về kho trước, tiền chốt sau bằng cách giảm trừ công nợ."
        hanhDong={
          duocLap ? (
            <Link className="nut chinh" href="/tra-hang/khach-tra/moi">
              Lập phiếu trả hàng
            </Link>
          ) : null
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Phiếu đang mở</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.dangMo)}</div>
          <div className="ghi-chu">Nháp và đã nhận lại hàng</div>
        </div>
        <div className={`the chi-so ${kq.tomTat.choXacNhan > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Chờ nhận lại hàng</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.choXacNhan)}</div>
          <div className="ghi-chu">Thủ kho xác nhận khi hàng về</div>
        </div>
        <div className={`the chi-so ${kq.tomTat.choChotTien > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Chờ chốt tiền</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.choChotTien)}</div>
          <div className="ghi-chu">{dinhDangTien(kq.tomTat.giaTriChoChotTien)} chưa giảm trừ vào hóa đơn</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số phiếu, tên khách, số đơn hàng" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-mo"}>
              <option value="dang-mo">Đang mở</option>
              <option value="DRAFT">Nháp</option>
              <option value="CONFIRMED">Đã nhận lại hàng</option>
              <option value="SETTLED">Đã chốt tiền</option>
              <option value="CANCELLED">Đã hủy</option>
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <div className="truong">
            <label htmlFor="loai">Loại phiếu</label>
            <select id="loai" name="loai" defaultValue={boLoc.loai}>
              <option value="">Tất cả</option>
              <option value="tra-hang">Khách trả hàng</option>
              <option value="doi-may">Đổi máy</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/tra-hang/khach-tra">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có phiếu nào khớp bộ lọc" : "Chưa có phiếu trả hàng nào đang mở"}>
            {!coLoc && "Khi khách mang hàng về, lập phiếu từ đây hoặc từ nút “Khách trả hàng” trên trang đơn hàng."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Phiếu</th>
                  <th>Khách hàng</th>
                  <th className="an-tren-dt">Hàng trả</th>
                  <th className="so">Giá trị</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((p) => (
                  <tr key={p.id} className={p.trangThai === "CANCELLED" ? "mo" : undefined}>
                    <td>
                      <Link href={`/tra-hang/khach-tra/${p.id}`}>
                        <strong>{p.so}</strong>
                      </Link>
                      <div className="dong-phu">
                        {dinhDangNgay(p.ngayTra)} · {NHAN_LOAI_TRA_HANG[p.loai] ?? p.loai}
                      </div>
                      {p.donHang && (
                        <div className="dong-phu">
                          từ <Link href={`/ban-hang/don-hang/${p.donHang.id}`}>{p.donHang.so}</Link>
                        </div>
                      )}
                    </td>
                    <td>{p.khachHang.ten}</td>
                    <td className="an-tren-dt nho">
                      {p.dong.map((d) => (
                        <div key={d.id}>
                          {d.ten} · {d.soLuong}
                          {d.tinhTrang === "loi" && (
                            <span className={`huy-hieu ${NHAN_TINH_TRANG_HANG.loi.lop}`} style={{ marginLeft: 6 }}>
                              {NHAN_TINH_TRANG_HANG.loi.nhan}
                            </span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="so">
                      {p.loai === "doi-may" ? (
                        <span className="phu">Đổi ngang</span>
                      ) : (
                        <>
                          <strong>{dinhDangTien(p.tongCong)}</strong>
                          {p.daGiamTru > 0 && <div className="dong-phu">đã giảm trừ {dinhDangTien(p.daGiamTru)}</div>}
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_TRA_HANG[p.trangThai] ?? ""}`}>
                        {NHAN_TRANG_THAI_TRA_BAN[p.trangThai] ?? p.trangThai}
                      </span>
                      {p.lyDoHuy && <div className="dong-phu chu-loi">{p.lyDoHuy}</div>}
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
          duongDan="/tra-hang/khach-tra"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-mo", loai: boLoc.loai, khachHang: boLoc.khachHang }}
        />
      </section>
    </>
  );
}
