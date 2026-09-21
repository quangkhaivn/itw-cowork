import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocPhieuChi } from "@/modules/cong-no-tra/luoc-do";
import { danhSachPhieuChi } from "@/modules/cong-no-tra/service";
import { NHAN_PHUONG_THUC_THU } from "@/modules/tai-chinh/tinh-toan";
import HuyPhieuChi from "./HuyPhieuChi";

export const dynamic = "force-dynamic";

const LA_NGAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function TrangPhieuChi({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("finance.view");
  const sp = await searchParams;
  const boLoc = LuocDoLocPhieuChi.parse({
    q: layMot(sp.q),
    tuNgay: LA_NGAY.test(layMot(sp.tuNgay)) ? layMot(sp.tuNgay) : "",
    denNgay: LA_NGAY.test(layMot(sp.denNgay)) ? layMot(sp.denNgay) : "",
    trang: layMot(sp.trang) || 1,
  });

  const kq = await docDuLieu(nd, (tx) => danhSachPhieuChi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.q || boLoc.tuNgay || boLoc.denNgay);
  const duocHuy = coQuyen(nd.hoSo, "finance.approve");

  return (
    <>
      <DauTrang
        tieuDe="Phiếu chi"
        duongDan={[{ nhan: "Tài chính" }]}
        moTa="Tiền đã trả nhà cung cấp và đã trừ vào hóa đơn nào. Một phiếu chi trừ được cho nhiều hóa đơn."
        hanhDong={
          <Link className="nut" href="/tai-chinh/cong-no-tra">
            Xem công nợ phải trả
          </Link>
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Tổng tiền đã chi {coLoc ? "(theo bộ lọc)" : ""}</div>
          <div className="gia-tri">{dinhDangTien(kq.tongTienChi)}</div>
          <div className="ghi-chu">Không tính phiếu đã hủy</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số phiếu, tham chiếu, tên nhà cung cấp" />
          </div>
          <div className="truong">
            <label htmlFor="tuNgay">Từ ngày</label>
            <input id="tuNgay" name="tuNgay" type="date" defaultValue={boLoc.tuNgay ?? ""} />
          </div>
          <div className="truong">
            <label htmlFor="denNgay">Đến ngày</label>
            <input id="denNgay" name="denNgay" type="date" defaultValue={boLoc.denNgay ?? ""} />
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/tai-chinh/phieu-chi">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có phiếu chi nào khớp bộ lọc" : "Chưa có phiếu chi nào"}>
            {!coLoc && "Mở một hóa đơn nhà cung cấp đã ghi nhận rồi bấm “Chi tiền” khi trả."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Phiếu chi</th>
                  <th>Nhà cung cấp</th>
                  <th>Hình thức</th>
                  <th className="so">Số tiền</th>
                  <th className="an-tren-dt">Trừ vào hóa đơn</th>
                  {duocHuy && <th />}
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((p) => (
                  <tr key={p.id} className={p.trangThai === "huy" ? "mo" : undefined}>
                    <td>
                      <strong>{p.so}</strong>
                      <div className="dong-phu">
                        {dinhDangNgay(p.ngayChi)}
                        {p.thamChieu ? ` · ${p.thamChieu}` : ""}
                      </div>
                      {p.trangThai === "huy" && <div className="dong-phu chu-loi">Đã hủy: {p.lyDoHuy}</div>}
                    </td>
                    <td>
                      <Link href={`/san-pham/nha-cung-cap/${p.nhaCungCap.id}`}>{p.nhaCungCap.ten}</Link>
                    </td>
                    <td className="nho">{NHAN_PHUONG_THUC_THU[p.phuongThuc] ?? p.phuongThuc}</td>
                    <td className="so">{dinhDangTien(p.soTien)}</td>
                    <td className="an-tren-dt nho">
                      {p.phanBo.map((pb) => (
                        <div key={pb.hoaDonId}>
                          <Link href={`/tai-chinh/hoa-don-mua/${pb.hoaDonId}`}>{pb.soHoaDon}</Link> · {dinhDangTien(pb.soTien)}
                        </div>
                      ))}
                    </td>
                    {duocHuy && <td>{p.trangThai === "hoat-dong" && <HuyPhieuChi phieuChiId={p.id} so={p.so} />}</td>}
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
          duongDan="/tai-chinh/phieu-chi"
          thamSo={{ q: boLoc.q, tuNgay: boLoc.tuNgay ?? "", denNgay: boLoc.denNgay ?? "" }}
        />
      </section>
    </>
  );
}
