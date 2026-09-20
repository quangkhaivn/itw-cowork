import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { homNayVN } from "@/modules/crm/chung";
import { LuocDoLocGiaHan } from "@/modules/bao-tri/luoc-do";
import { danhSachGiaHan, NHAN_NGUON_GIA_HAN, NHAN_TRANG_THAI_GIA_HAN } from "@/modules/bao-tri/service";
import TacVuGiaHan from "./TacVuGiaHan";

export const dynamic = "force-dynamic";

const TRANG_THAI = ["moi", "da-tao-co-hoi", "bo-qua"];

/**
 * Lịch gia hạn — bảo hành và hợp đồng bảo trì sắp hết hạn.
 *
 * Dòng ở đây do **bản quét lập sẵn**, không tự thành cơ hội. Người bán nhìn rồi quyết:
 * mở cơ hội, hoặc bỏ qua kèm lý do (GH-02).
 */
export default async function TrangGiaHan({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("service_desk.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const nguon = layMot(sp.nguon);
  const boLoc = LuocDoLocGiaHan.parse({
    q: layMot(sp.q),
    // "moi" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "moi" ? "" : tt === "tat-ca" || TRANG_THAI.includes(tt) ? tt : "",
    nguon: nguon === "bao-hanh" || nguon === "bao-tri" ? nguon : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachGiaHan(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.nguon);
  const homNay = homNayVN();
  const duocChot = coQuyen(nd.hoSo, "sales.create");
  const duocBoQua = coQuyen(nd.hoSo, "service_desk.update");
  const quaHan = kq.dong.filter((g) => g.trangThai === "moi" && g.soNgayConLai < 0).length;

  return (
    <>
      <DauTrang
        tieuDe="Lịch gia hạn"
        duongDan={[{ nhan: "Dịch vụ" }]}
        moTa="Bảo hành và hợp đồng bảo trì sắp hết hạn. Hệ thống lập sẵn danh sách; mở cơ hội hay bỏ qua là quyết định của người bán."
        hanhDong={
          <Link className="nut" href="/dich-vu/bao-hanh">
            Danh sách bảo hành
          </Link>
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Đang chờ chốt</div>
          <div className="gia-tri">{dinhDangSo(kq.tong)}</div>
          <div className="ghi-chu">Theo bộ lọc hiện tại</div>
        </div>
        <div className={`the chi-so ${quaHan > 0 ? "loi" : ""}`}>
          <div className="nhan">Đã quá hạn (trang này)</div>
          <div className="gia-tri">{dinhDangSo(quaHan)}</div>
          <div className="ghi-chu">Hết hạn rồi mà chưa ai xử lý</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Nội dung gia hạn, tên khách" />
          </div>
          <div className="truong">
            <label htmlFor="nguon">Nguồn</label>
            <select id="nguon" name="nguon" defaultValue={boLoc.nguon}>
              <option value="">Tất cả nguồn</option>
              <option value="bao-hanh">Bảo hành</option>
              <option value="bao-tri">Hợp đồng bảo trì</option>
            </select>
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "moi"}>
              <option value="moi">Chờ chốt</option>
              <option value="da-tao-co-hoi">Đã mở cơ hội</option>
              <option value="bo-qua">Đã bỏ qua</option>
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/dich-vu/gia-han">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có dòng nào khớp bộ lọc" : "Chưa có lịch gia hạn nào"}>
            {!coLoc &&
              "Bản quét lập danh sách này khi có bảo hành hoặc hợp đồng bảo trì sắp hết hạn. Cần đặt ngưỡng cảnh báo ở Quản trị → Cấu hình."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Nội dung</th>
                  <th>Khách hàng</th>
                  <th>Đến hạn</th>
                  <th className="an-tren-dt">Nguồn</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.tieuDe}</strong>
                      {g.baoHanh?.serial && <div className="dong-phu">Máy số {g.baoHanh.serial}</div>}
                      {g.hopDongBaoTri && (
                        <div className="dong-phu">
                          <Link href={`/dich-vu/bao-tri/${g.hopDongBaoTri.id}`}>{g.hopDongBaoTri.ma}</Link>
                        </div>
                      )}
                    </td>
                    <td>
                      <Link href={`/crm/khach-hang/${g.khachHang.id}`}>{g.khachHang.ten}</Link>
                      {g.nguoiPhuTrach && <div className="dong-phu">{g.nguoiPhuTrach.hoTen}</div>}
                    </td>
                    <td className="nho">
                      {dinhDangNgay(g.denHan)}
                      <div className="dong-phu">
                        {g.soNgayConLai < 0 ? (
                          <span className="chu-loi">quá {dinhDangSo(-g.soNgayConLai)} ngày</span>
                        ) : (
                          `còn ${dinhDangSo(g.soNgayConLai)} ngày`
                        )}
                      </div>
                    </td>
                    <td className="an-tren-dt nho">{NHAN_NGUON_GIA_HAN[g.nguon] ?? g.nguon}</td>
                    <td>
                      <span className={`huy-hieu ${NHAN_TRANG_THAI_GIA_HAN[g.trangThai]?.lop ?? ""}`}>
                        {NHAN_TRANG_THAI_GIA_HAN[g.trangThai]?.nhan ?? g.trangThai}
                      </span>
                      {g.coHoi && (
                        <div className="dong-phu">
                          <Link href={`/ban-hang/co-hoi/${g.coHoi.id}`}>{g.coHoi.ma}</Link>
                        </div>
                      )}
                      {g.lyDoBoQua && <div className="dong-phu phu">{g.lyDoBoQua}</div>}
                    </td>
                    <td>
                      {g.trangThai === "moi" && (
                        <TacVuGiaHan
                          id={g.id}
                          tieuDe={g.tieuDe}
                          duocChot={duocChot}
                          duocBoQua={duocBoQua}
                          ngayGoiY={homNay}
                        />
                      )}
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
          duongDan="/dich-vu/gia-han"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "moi", nguon: boLoc.nguon }}
        />
      </section>
    </>
  );
}
