import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocDonMua } from "@/modules/mua-hang/luoc-do";
import { danhSachDonMua } from "@/modules/mua-hang/service";
import { LOP_TRANG_THAI_DON_MUA, NHAN_TRANG_THAI_DON_MUA, TRANG_THAI_DON_MUA } from "@/modules/mua-hang/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangDonMua({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("purchasing.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocDonMua.parse({
    q: layMot(sp.q),
    // "dang-chay" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "dang-chay" ? "" : tt === "tat-ca" || (TRANG_THAI_DON_MUA as readonly string[]).includes(tt) ? tt : "",
    nhaCungCap: LA_UUID.test(layMot(sp.nhaCungCap)) ? layMot(sp.nhaCungCap) : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachDonMua(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.nhaCungCap);
  const choNhan = kq.dong.filter((o) => ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"].includes(o.trangThai));
  const giaTriChoNhan = choNhan.reduce((s, o) => s + Number(o.tongCong), 0);

  return (
    <>
      <DauTrang
        tieuDe="Đơn mua"
        duongDan={[{ nhan: "Mua hàng" }]}
        moTa="Đặt hàng nhà cung cấp và nhận hàng vào kho. Hàng nhận vào đi thẳng vào sổ kho, không phải nhập tay lần nữa."
        hanhDong={
          <Link className="nut" href="/mua-hang/de-nghi">
            Đề nghị mua
          </Link>
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Đơn đang chờ nhận (trang này)</div>
          <div className="gia-tri">{dinhDangSo(choNhan.length)}</div>
          <div className="ghi-chu">{dinhDangTien(giaTriChoNhan)}</div>
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
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số đơn, tên nhà cung cấp, tên hàng" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-chay"}>
              <option value="dang-chay">Đang chạy</option>
              {TRANG_THAI_DON_MUA.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_DON_MUA[t]}
                </option>
              ))}
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/mua-hang/don-mua">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có đơn mua nào khớp bộ lọc" : "Chưa có đơn mua nào"}>
            {!coLoc && "Đơn mua lập từ một đề nghị đã duyệt, hoặc lập thẳng khi đã biết mua gì của ai."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Đơn mua</th>
                  <th>Nhà cung cấp</th>
                  <th className="so">Tổng tiền</th>
                  <th>Tiến độ nhận</th>
                  <th className="an-tren-dt">Hẹn giao</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/mua-hang/don-mua/${o.id}`}>
                        <strong>{o.so}</strong>
                      </Link>
                      {o.deNghi && (
                        <div className="dong-phu">
                          từ <Link href={`/mua-hang/de-nghi/${o.deNghi.id}`}>{o.deNghi.so}</Link>
                        </div>
                      )}
                    </td>
                    <td>{o.nhaCungCap.ten}</td>
                    <td className="so">{dinhDangTien(o.tongCong)}</td>
                    <td className="nho">
                      {o.tienDo.tongDaNhan} / {o.tienDo.tongDat}
                      <div className="dong-phu">{o.tienDo.phanTram}%</div>
                    </td>
                    <td className="an-tren-dt nho">{o.ngayHenGiao ? dinhDangNgay(o.ngayHenGiao) : <span className="phu">—</span>}</td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_DON_MUA[o.trangThai] ?? ""}`}>
                        {NHAN_TRANG_THAI_DON_MUA[o.trangThai] ?? o.trangThai}
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
          duongDan="/mua-hang/don-mua"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-chay", nhaCungCap: boLoc.nhaCungCap }}
        />
      </section>
    </>
  );
}
