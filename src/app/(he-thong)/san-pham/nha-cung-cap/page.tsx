import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { danhSachNhaCungCap, LuocDoLocNhaCungCap } from "@/modules/nha-cung-cap/service";
import FormNhaCungCap from "./FormNhaCungCap";

export const dynamic = "force-dynamic";

export default async function TrangNhaCungCap({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("supplier.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocNhaCungCap.parse({
    q: layMot(sp.q),
    trangThai: ["hoat-dong", "ngung-hoat-dong"].includes(tt) ? tt : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, dieuKhoan } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      kq: await danhSachNhaCungCap(nc, boLoc),
      dieuKhoan: (await luaChonDuLieuGoc(nc, ["dieu_khoan_thanh_toan"])).dieu_khoan_thanh_toan,
    };
  });
  const duocTao = coQuyen(nd.hoSo, "supplier.create");

  return (
    <>
      <DauTrang
        tieuDe="Nhà cung cấp"
        duongDan={[{ nhan: "Sản phẩm", href: "/san-pham" }]}
        moTa="Nguồn hàng của công ty. Giá mua của từng nhà cung cấp nằm trong bảng giá của mỗi sản phẩm."
        hanhDong={duocTao && <FormNhaCungCap dieuKhoan={dieuKhoan} moNgay={layMot(sp.tao) === "1"} />}
      />
      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Tên, mã NCC, MST, điện thoại, người liên hệ" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai}>
              <option value="">Tất cả</option>
              <option value="hoat-dong">Đang hợp tác</option>
              <option value="ngung-hoat-dong">Ngừng</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {(boLoc.q || boLoc.trangThai) && (
            <Link className="nut trong" href="/san-pham/nha-cung-cap">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={boLoc.q || boLoc.trangThai ? "Không có nhà cung cấp khớp bộ lọc" : "Chưa có nhà cung cấp nào"}>
            {duocTao && !boLoc.q ? "Thêm nhà cung cấp để nhập bảng giá và so sánh nguồn mua." : null}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Nhà cung cấp</th>
                  <th>Liên hệ</th>
                  <th className="an-tren-dt">MST</th>
                  <th className="so">Mặt hàng</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((n) => (
                  <tr key={n.id} className={n.trangThai !== "hoat-dong" ? "mo" : undefined}>
                    <td>
                      <Link href={`/san-pham/nha-cung-cap/${n.id}`}>{n.ten}</Link>
                      <div className="dong-phu">{n.ma}</div>
                    </td>
                    <td>
                      {n.nguoiLienHe ?? <span className="mo">—</span>}
                      {n.dienThoai && <div className="dong-phu">{n.dienThoai}</div>}
                    </td>
                    <td className="an-tren-dt">{n.maSoThue ?? <span className="mo">—</span>}</td>
                    <td className="so">{n.soMatHang ? dinhDangSo(n.soMatHang) : <span className="mo">0</span>}</td>
                    <td>
                      <span className={`huy-hieu ${n.trangThai === "hoat-dong" ? "tot" : ""}`}>{n.trangThai === "hoat-dong" ? "Đang hợp tác" : "Ngừng"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/san-pham/nha-cung-cap" thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai }} />
      </section>
    </>
  );
}
