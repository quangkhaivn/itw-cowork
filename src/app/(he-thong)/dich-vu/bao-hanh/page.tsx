import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachBaoHanh, LuocDoLocBaoHanh } from "@/modules/bao-hanh/service";
import { NHAN_MUC_BAO_HANH } from "@/modules/bao-hanh/tinh-toan";

export const dynamic = "force-dynamic";

export default async function TrangBaoHanh({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("service_desk.view");
  const sp = await searchParams;
  const tinhTrang = layMot(sp.tinhTrang);
  const boLoc = LuocDoLocBaoHanh.parse({
    q: layMot(sp.q),
    tinhTrang: ["sap-het", "het-han", "tat-ca"].includes(tinhTrang) ? tinhTrang : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachBaoHanh(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.tinhTrang);

  return (
    <>
      <DauTrang
        tieuDe="Bảo hành"
        duongDan={[{ nhan: "Dịch vụ" }]}
        moTa="Mỗi máy đã giao là một phiếu bảo hành, tính từ ngày giao hàng. Tra theo số sê-ri để biết còn hạn hay không."
        hanhDong={
          coQuyen(nd.hoSo, "service_desk.create") && (
            <Link className="nut" href="/dich-vu/ho-tro/moi">
              Mở phiếu hỗ trợ
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Máy còn bảo hành</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.conHan)}</div>
        </div>
        <div className={`the chi-so${kq.tomTat.sapHet && kq.tomTat.sapHet > 0 ? " canh-bao" : ""}`}>
          <div className="nhan">Sắp hết bảo hành</div>
          <div className="gia-tri">{kq.tomTat.sapHet === null ? "—" : dinhDangSo(kq.tomTat.sapHet)}</div>
          <div className="ghi-chu">
            {kq.nguongSapHetNgay === null ? (
              <>
                Chưa đặt ngưỡng cảnh báo. <Link href="/quan-tri/cau-hinh">Đặt ở Cấu hình</Link>
              </>
            ) : (
              `Trong ${kq.nguongSapHetNgay} ngày tới`
            )}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Đã hết bảo hành</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.hetHan)}</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số sê-ri, tên hàng, tên khách" />
          </div>
          <div className="truong">
            <label htmlFor="tinhTrang">Tình trạng</label>
            <select id="tinhTrang" name="tinhTrang" defaultValue={boLoc.tinhTrang}>
              <option value="">Còn bảo hành</option>
              <option value="sap-het">Sắp hết</option>
              <option value="het-han">Đã hết</option>
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/dich-vu/bao-hanh">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có bảo hành khớp bộ lọc" : "Chưa có bảo hành nào"}>
            {!coLoc && "Bảo hành tự sinh khi xuất kho giao hàng cho khách."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Máy</th>
                  <th>Khách hàng</th>
                  <th className="an-tren-dt">Từ ngày</th>
                  <th>Đến ngày</th>
                  <th>Tình trạng</th>
                  <th className="an-tren-dt">Chứng từ</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((b) => {
                  const m = NHAN_MUC_BAO_HANH[b.mucBaoHanh];
                  return (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/dich-vu/bao-hanh/${b.id}`}>{b.serial ?? b.tenHang}</Link>
                        <div className="dong-phu">
                          {b.tenHang}
                          {b.soThang > 0 ? ` · ${b.soThang} tháng` : " · không bảo hành"}
                        </div>
                      </td>
                      <td>
                        <Link href={`/crm/khach-hang/${b.khachHang.id}`}>{b.khachHang.ten}</Link>
                      </td>
                      <td className="an-tren-dt so nho">{dinhDangNgay(b.ngayBatDau)}</td>
                      <td className="so">
                        {dinhDangNgay(b.ngayHetHan)}
                        {b.mucBaoHanh !== "huy" && (
                          <div className="dong-phu">{b.soNgayConLai >= 0 ? `còn ${dinhDangSo(b.soNgayConLai)} ngày` : `hết ${dinhDangSo(-b.soNgayConLai)} ngày trước`}</div>
                        )}
                      </td>
                      <td>
                        <span className={`huy-hieu ${m.lop}`}>{m.nhan}</span>
                      </td>
                      <td className="an-tren-dt nho">
                        {b.donHang && coQuyen(nd.hoSo, "order.view") ? <Link href={`/ban-hang/don-hang/${b.donHang.id}`}>{b.donHang.so}</Link> : "—"}
                        {b.phieuXuat && <div className="dong-phu">{b.phieuXuat.so}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/dich-vu/bao-hanh" thamSo={{ q: boLoc.q, tinhTrang: boLoc.tinhTrang }} />
      </section>
    </>
  );
}
