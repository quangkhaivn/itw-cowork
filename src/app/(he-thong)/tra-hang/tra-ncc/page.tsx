import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauMotTrongCacQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocTraHangMua } from "@/modules/tra-hang/luoc-do";
import { danhSachTraHangMua } from "@/modules/tra-hang/service";
import { LOP_TRANG_THAI_TRA_HANG, NHAN_TRANG_THAI_TRA_MUA } from "@/modules/tra-hang/tinh-toan";

export const dynamic = "force-dynamic";

const QUYEN_XEM = ["purchasing.view", "finance.view"];
const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANG_THAI = ["DRAFT", "CONFIRMED", "SETTLED", "CANCELLED"];

export default async function TrangTraNhaCungCap({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauMotTrongCacQuyen(QUYEN_XEM);
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocTraHangMua.parse({
    q: layMot(sp.q),
    trangThai: tt === "dang-mo" ? "" : tt === "tat-ca" || TRANG_THAI.includes(tt) ? tt : "",
    nhaCungCap: LA_UUID.test(layMot(sp.nhaCungCap)) ? layMot(sp.nhaCungCap) : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachTraHangMua(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.nhaCungCap);
  const duocLap = coQuyen(nd.hoSo, "purchasing.update");

  return (
    <>
      <DauTrang
        tieuDe="Trả hàng nhà cung cấp"
        duongDan={[{ nhan: "Trả hàng" }]}
        moTa="Gửi trả hàng lỗi hoặc hàng giao sai cho nhà cung cấp. Hàng ra khỏi kho trước, rồi giảm trừ vào hóa đơn còn nợ."
        hanhDong={
          duocLap ? (
            <Link className="nut chinh" href="/tra-hang/tra-ncc/moi">
              Lập phiếu trả hàng
            </Link>
          ) : null
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Phiếu đang mở</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.dangMo)}</div>
        </div>
        <div className={`the chi-so ${kq.tomTat.choXacNhan > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Chờ xuất hàng đi</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.choXacNhan)}</div>
        </div>
        <div className={`the chi-so ${kq.tomTat.choChotTien > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Chờ chốt tiền</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.choChotTien)}</div>
          <div className="ghi-chu">{dinhDangTien(kq.tomTat.giaTriChoChotTien)} chưa giảm trừ công nợ</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số phiếu, tên nhà cung cấp, số đơn mua" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-mo"}>
              <option value="dang-mo">Đang mở</option>
              <option value="DRAFT">Nháp</option>
              <option value="CONFIRMED">Đã trả hàng đi</option>
              <option value="SETTLED">Đã chốt tiền</option>
              <option value="CANCELLED">Đã hủy</option>
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/tra-hang/tra-ncc">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có phiếu nào khớp bộ lọc" : "Chưa có phiếu trả hàng nhà cung cấp nào đang mở"}>
            {!coLoc && "Mở một đơn mua đã nhận hàng rồi bấm “Trả hàng nhà cung cấp”, hoặc lập phiếu từ đây."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Phiếu</th>
                  <th>Nhà cung cấp</th>
                  <th className="an-tren-dt">Hàng trả</th>
                  <th className="so">Giá trị</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((p) => (
                  <tr key={p.id} className={p.trangThai === "CANCELLED" ? "mo" : undefined}>
                    <td>
                      <Link href={`/tra-hang/tra-ncc/${p.id}`}>
                        <strong>{p.so}</strong>
                      </Link>
                      <div className="dong-phu">{dinhDangNgay(p.ngayTra)}</div>
                      {p.donMua && (
                        <div className="dong-phu">
                          từ <Link href={`/mua-hang/don-mua/${p.donMua.id}`}>{p.donMua.so}</Link>
                        </div>
                      )}
                    </td>
                    <td>{p.nhaCungCap.ten}</td>
                    <td className="an-tren-dt nho">
                      {p.dong.map((d) => (
                        <div key={d.id}>
                          {d.ten} · {d.soLuong}
                        </div>
                      ))}
                    </td>
                    <td className="so">
                      <strong>{dinhDangTien(p.tongCong)}</strong>
                      {p.daGiamTru > 0 && <div className="dong-phu">đã giảm trừ {dinhDangTien(p.daGiamTru)}</div>}
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_TRA_HANG[p.trangThai] ?? ""}`}>
                        {NHAN_TRANG_THAI_TRA_MUA[p.trangThai] ?? p.trangThai}
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
          duongDan="/tra-hang/tra-ncc"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-mo", nhaCungCap: boLoc.nhaCungCap }}
        />
      </section>
    </>
  );
}
