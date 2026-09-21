import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocDeNghi } from "@/modules/mua-hang/luoc-do";
import { danhSachDeNghi } from "@/modules/mua-hang/service";
import { LOP_TRANG_THAI_DE_NGHI, NHAN_TRANG_THAI_DE_NGHI, TRANG_THAI_DE_NGHI } from "@/modules/mua-hang/tinh-toan";

export const dynamic = "force-dynamic";

export default async function TrangDeNghiMua({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("purchasing.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocDeNghi.parse({
    q: layMot(sp.q),
    // "dang-chay" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "dang-chay" ? "" : tt === "tat-ca" || (TRANG_THAI_DE_NGHI as readonly string[]).includes(tt) ? tt : "",
    choDuyet: layMot(sp.choDuyet) === "1" ? "1" : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachDeNghi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.choDuyet);
  const choDuyet = kq.dong.filter((d) => d.trangThai === "PENDING_APPROVAL").length;

  return (
    <>
      <DauTrang
        tieuDe="Đề nghị mua"
        duongDan={[{ nhan: "Mua hàng" }]}
        moTa="Ai cần mua gì, vì sao. Duyệt xong mới đặt được nhà cung cấp — người đề nghị không tự duyệt đề nghị của mình."
        hanhDong={
          coQuyen(nd.hoSo, "purchasing.create") && (
            <Link className="nut chinh" href="/mua-hang/de-nghi/moi">
              <BieuTuong ten="them" co={16} /> Lập đề nghị
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className={`the chi-so ${choDuyet > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Đang chờ duyệt (trang này)</div>
          <div className="gia-tri">{dinhDangSo(choDuyet)}</div>
          <div className="ghi-chu">
            <Link href="/mua-hang/de-nghi?choDuyet=1">Chỉ xem đề nghị chờ duyệt</Link>
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
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số đề nghị, lý do, tên hàng" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-chay"}>
              <option value="dang-chay">Đang chạy</option>
              {TRANG_THAI_DE_NGHI.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_DE_NGHI[t]}
                </option>
              ))}
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/mua-hang/de-nghi">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có đề nghị nào khớp bộ lọc" : "Chưa có đề nghị mua nào"}>
            {!coLoc && "Khi đơn bán thiếu hàng, mở trang đơn và bấm Đề nghị mua để hệ thống điền sẵn phần còn thiếu."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Đề nghị</th>
                  <th>Nội dung</th>
                  <th className="so an-tren-dt">Dự kiến</th>
                  <th className="an-tren-dt">Cần trước</th>
                  <th className="an-tren-dt">Người đề nghị</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/mua-hang/de-nghi/${d.id}`}>
                        <strong>{d.so}</strong>
                      </Link>
                      {d.donBan && (
                        <div className="dong-phu">
                          từ đơn <Link href={`/ban-hang/don-hang/${d.donBan.id}`}>{d.donBan.so}</Link>
                        </div>
                      )}
                    </td>
                    <td>
                      {d.dong.length > 0 ? (
                        <>
                          {d.dong[0].ten}
                          {d.dong.length > 1 && <span className="phu"> và {d.dong.length - 1} dòng khác</span>}
                        </>
                      ) : (
                        <span className="phu">Chưa có dòng nào</span>
                      )}
                      {d.lyDo && <div className="dong-phu">{d.lyDo}</div>}
                    </td>
                    <td className="so an-tren-dt">{dinhDangTien(d.tongDuKien)}</td>
                    <td className="an-tren-dt nho">{d.ngayCan ? dinhDangNgay(d.ngayCan) : <span className="phu">—</span>}</td>
                    <td className="an-tren-dt nho">{d.nguoiDeNghi.hoTen}</td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_DE_NGHI[d.trangThai] ?? ""}`}>
                        {NHAN_TRANG_THAI_DE_NGHI[d.trangThai] ?? d.trangThai}
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
          duongDan="/mua-hang/de-nghi"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-chay", choDuyet: boLoc.choDuyet }}
        />
      </section>
    </>
  );
}
