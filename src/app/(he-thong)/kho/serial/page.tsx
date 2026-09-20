import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocSerial } from "@/modules/kho/luoc-do";
import { danhSachKho, danhSachSerial } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NHAN_TRANG_THAI: Record<string, { nhan: string; lop: string }> = {
  "trong-kho": { nhan: "Trong kho", lop: "tot" },
  "da-ban": { nhan: "Đã bán", lop: "chinh" },
  "tra-lai": { nhan: "Khách trả lại", lop: "canh-bao" },
};

export default async function TrangSerial({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("inventory.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocSerial.parse({
    q: layMot(sp.q),
    kho: LA_UUID.test(layMot(sp.kho)) ? layMot(sp.kho) : "",
    trangThai: ["trong-kho", "da-ban", "tra-lai"].includes(tt) ? tt : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, kho } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { kq: await danhSachSerial(nc, boLoc), kho: await danhSachKho(nc) };
  });
  const coLoc = Boolean(boLoc.q || boLoc.kho || boLoc.trangThai);

  return (
    <>
      <DauTrang
        tieuDe="Số sê-ri"
        duongDan={[{ nhan: "Kho" }, { nhan: "Tồn kho", href: "/kho" }]}
        moTa="Từng máy một: đang ở kho nào, đã bán cho ai, theo đơn nào. Dùng để tra bảo hành sau này."
      />

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm số sê-ri</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Nhập một phần số sê-ri" />
          </div>
          <div className="truong">
            <label htmlFor="kho">Kho</label>
            <select id="kho" name="kho" defaultValue={boLoc.kho}>
              <option value="">Tất cả kho</option>
              {kho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten} ({k.ma})
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai}>
              <option value="">Tất cả</option>
              <option value="trong-kho">Trong kho</option>
              <option value="da-ban">Đã bán</option>
              <option value="tra-lai">Khách trả lại</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/kho/serial">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có số sê-ri khớp bộ lọc" : "Chưa có số sê-ri nào"}>
            {!coLoc && "Sê-ri được ghi khi nhập kho hàng có quản lý theo máy (laptop, PC, camera…)."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Số sê-ri</th>
                  <th>Hàng hóa</th>
                  <th>Trạng thái</th>
                  <th className="an-tren-dt">Vị trí</th>
                  <th className="an-tren-dt">Bán cho</th>
                  <th className="an-tren-dt">Ghi lúc</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((s) => {
                  const tt = NHAN_TRANG_THAI[s.trangThai] ?? { nhan: s.trangThai, lop: "" };
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.serial}</strong>
                      </td>
                      <td>
                        {coQuyen(nd.hoSo, "product.view") ? <Link href={`/san-pham/${s.sanPham.id}`}>{s.sanPham.ten}</Link> : s.sanPham.ten}
                        <div className="dong-phu">{s.sanPham.sku}</div>
                      </td>
                      <td>
                        <span className={`huy-hieu ${tt.lop}`}>{tt.nhan}</span>
                      </td>
                      <td className="an-tren-dt nho">{s.kho ? s.kho.ma : <span className="mo">Không còn trong kho</span>}</td>
                      <td className="an-tren-dt nho">
                        {s.donHang ? (
                          <>
                            <Link href={`/ban-hang/don-hang/${s.donHang.id}`}>{s.donHang.so}</Link>
                            <div className="dong-phu">{s.donHang.khach}</div>
                          </>
                        ) : (
                          <span className="mo">—</span>
                        )}
                      </td>
                      <td className="an-tren-dt so nho">{dinhDangNgay(s.taoLuc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/kho/serial" thamSo={{ q: boLoc.q, kho: boLoc.kho, trangThai: boLoc.trangThai }} />
      </section>
    </>
  );
}
