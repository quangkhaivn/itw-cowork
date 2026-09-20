import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangPhanTram, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { LuocDoLocBaoGia } from "@/modules/bao-gia/luoc-do";
import { danhSachBaoGia } from "@/modules/bao-gia/service";
import { LOP_TRANG_THAI_BAO_GIA, NHAN_TRANG_THAI_BAO_GIA, TRANG_THAI_BAO_GIA } from "@/modules/bao-gia/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangBaoGia({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("quotation.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const choDuyet = layMot(sp.choDuyet) === "1" ? "1" : "";
  const boLoc = LuocDoLocBaoGia.parse({
    q: layMot(sp.q),
    // "dang-chay" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng nên không dùng "" trên URL).
    trangThai: tt === "dang-chay" ? "" : tt === "tat-ca" || (TRANG_THAI_BAO_GIA as readonly string[]).includes(tt) ? tt : "",
    nguoiPhuTrach: LA_UUID.test(layMot(sp.nguoiPhuTrach)) ? layMot(sp.nguoiPhuTrach) : "",
    choDuyet,
    trang: layMot(sp.trang) || 1,
  });

  const { kq, nguoi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { kq: await danhSachBaoGia(nc, boLoc), nguoi: await danhSachNguoiPhuTrach(nc, "quotation.view") };
  });
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.nguoiPhuTrach || boLoc.choDuyet);
  const duocDuyet = coQuyen(nd.hoSo, "quotation.approve");

  return (
    <>
      <DauTrang
        tieuDe="Báo giá"
        duongDan={[{ nhan: "Bán hàng" }]}
        moTa="Mỗi lần gửi khách là một phiên bản riêng. Sửa bản đã gửi thì tạo phiên bản mới — bản cũ giữ nguyên để đối chiếu."
        hanhDong={
          coQuyen(nd.hoSo, "quotation.create") && (
            <Link className="nut chinh" href="/ban-hang/bao-gia/moi">
              <BieuTuong ten="them" co={16} /> Lập báo giá
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Báo giá đang chạy</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.soDangChay)}</div>
          <div className="ghi-chu">{dinhDangTien(kq.tomTat.giaTriDangChay)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Khách đã chấp nhận</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.soDaNhan)}</div>
          <div className="ghi-chu">{dinhDangTien(kq.tomTat.giaTriDaNhan)}</div>
        </div>
        <div className={`the chi-so${kq.tomTat.soChoDuyet > 0 ? " canh-bao" : ""}`}>
          <div className="nhan">Chờ duyệt</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.soChoDuyet)}</div>
          <div className="ghi-chu">
            {kq.tomTat.soChoDuyet > 0 && duocDuyet ? (
              <Link href="/ban-hang/bao-gia?choDuyet=1">Xem hàng đợi duyệt</Link>
            ) : (
              "Báo giá dưới ngưỡng biên lợi nhuận"
            )}
          </div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số báo giá, tên khách hàng" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-chay"}>
              <option value="dang-chay">Đang chạy</option>
              <option value="tat-ca">Tất cả</option>
              {TRANG_THAI_BAO_GIA.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_BAO_GIA[t]}
                </option>
              ))}
            </select>
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiPhuTrach">Người lập</label>
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
              <input type="checkbox" name="choDuyet" value="1" defaultChecked={boLoc.choDuyet === "1"} />
              <span>Chỉ chờ duyệt</span>
            </label>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/ban-hang/bao-gia">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có báo giá khớp bộ lọc" : "Chưa có báo giá nào"}>
            {!coLoc && "Lập báo giá từ một cơ hội đang mở, hoặc bấm “Lập báo giá” rồi chọn khách hàng."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Báo giá</th>
                  <th>Khách hàng</th>
                  <th>Trạng thái</th>
                  <th className="so">Giá trị</th>
                  <th className="so an-tren-dt">Biên LN</th>
                  <th className="an-tren-dt">Hiệu lực</th>
                  <th>Người lập</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((b) => {
                  const pb = b.phienBanHienHanh;
                  const tt = pb?.trangThaiHienThi ?? b.trangThai;
                  return (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/ban-hang/bao-gia/${b.id}`}>{b.so}</Link>
                        <div className="dong-phu">
                          {pb ? `Phiên bản V${pb.phienBan}` : "Chưa có phiên bản"} · {dinhDangNgay(b.taoLuc)}
                        </div>
                      </td>
                      <td>
                        <Link href={`/crm/khach-hang/${b.khachHang.id}`}>{b.khachHang.ten}</Link>
                        {b.coHoi && (
                          <div className="dong-phu">
                            <Link href={`/ban-hang/co-hoi/${b.coHoi.id}`}>{b.coHoi.ma}</Link>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`huy-hieu ${LOP_TRANG_THAI_BAO_GIA[tt] ?? ""}`}>{NHAN_TRANG_THAI_BAO_GIA[tt] ?? tt}</span>
                      </td>
                      <td className="so">{pb ? dinhDangTien(pb.tongCong) : "—"}</td>
                      <td className="so an-tren-dt nho">
                        {pb?.bienLoiNhuan === null || pb === null ? <span className="mo">—</span> : <span className={pb.bienLoiNhuan < 0 ? "chu-loi" : undefined}>{dinhDangPhanTram(pb.bienLoiNhuan)}</span>}
                      </td>
                      <td className="an-tren-dt so nho">{pb?.hieuLucDen ? dinhDangNgay(pb.hieuLucDen) : "—"}</td>
                      <td>{b.nguoiPhuTrach.hoTen}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang
          tong={kq.tong}
          trang={kq.trang}
          coTrang={kq.coTrang}
          duongDan="/ban-hang/bao-gia"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-chay", nguoiPhuTrach: boLoc.nguoiPhuTrach, choDuyet: boLoc.choDuyet }}
        />
      </section>
    </>
  );
}
