import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc } from "@/modules/crm/chung";
import { LuocDoLocTonKho } from "@/modules/kho/luoc-do";
import { danhSachKho, tonKho } from "@/modules/kho/service";
import TacVuTonKho from "./TacVuTonKho";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NHAN_CANH_BAO: Record<string, { nhan: string; lop: string }> = {
  het: { nhan: "Hết hàng", lop: "loi" },
  "sap-het": { nhan: "Sắp hết", lop: "canh-bao" },
  du: { nhan: "Đủ", lop: "tot" },
};

export default async function TrangTonKho({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("inventory.view");
  const sp = await searchParams;
  const boLoc = LuocDoLocTonKho.parse({
    q: layMot(sp.q),
    kho: LA_UUID.test(layMot(sp.kho)) ? layMot(sp.kho) : "",
    canhBao: layMot(sp.canhBao) === "1" ? "1" : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, kho, tenDonVi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      kq: await tonKho(nc, boLoc),
      kho: await danhSachKho(nc),
      tenDonVi: (await banDoTenDuLieuGoc(nc, ["don_vi_tinh"])).don_vi_tinh ?? {},
    };
  });

  const duocSua = coQuyen(nd.hoSo, "inventory.update");
  const coLoc = Boolean(boLoc.q || boLoc.kho || boLoc.canhBao);
  const soCanhBao = kq.dong.filter((d) => d.mucCanhBao !== "du").length;

  return (
    <>
      <DauTrang
        tieuDe="Tồn kho"
        duongDan={[{ nhan: "Kho" }]}
        moTa="Hàng còn bán được = tồn kho trừ phần đang giữ chỗ cho đơn đã xác nhận. Mọi thay đổi tồn đều ghi vào thẻ kho và không sửa được."
        hanhDong={
          <>
            <Link className="nut" href="/kho/the-kho">
              Thẻ kho
            </Link>
            {coQuyen(nd.hoSo, "inventory.create") && (
              <Link className="nut chinh" href="/kho/nhap">
                <BieuTuong ten="them" co={16} /> Nhập kho
              </Link>
            )}
          </>
        }
      />

      {kho.length === 0 ? (
        <section className="the">
          <TrongRong tieuDe="Chưa khai kho nào">
            Tạo ít nhất một kho trước khi nhập hàng.
            <div style={{ marginTop: 12 }}>
              <Link className="nut chinh" href="/kho/danh-sach">
                Khai kho hàng
              </Link>
            </div>
          </TrongRong>
        </section>
      ) : (
        <section className="the">
          <form className="bo-loc" method="get">
            <div className="truong rong">
              <label htmlFor="q">Tìm</label>
              <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Mã SKU hoặc tên hàng" />
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
              <label className="o-chon" style={{ minHeight: 34, alignItems: "center" }}>
                <input type="checkbox" name="canhBao" value="1" defaultChecked={boLoc.canhBao === "1"} />
                <span>Chỉ hàng hết / sắp hết</span>
              </label>
            </div>
            <button className="nut" type="submit">
              Lọc
            </button>
            {coLoc && (
              <Link className="nut trong" href="/kho">
                Xóa lọc
              </Link>
            )}
          </form>

          {kq.dong.length === 0 ? (
            <TrongRong tieuDe={coLoc ? "Không có mặt hàng khớp bộ lọc" : "Kho chưa có hàng"}>
              {!coLoc && "Bấm “Nhập kho” để đưa hàng vào kho lần đầu."}
            </TrongRong>
          ) : (
            <>
              {soCanhBao > 0 && !boLoc.canhBao && (
                <div className="hop-thong-bao canh-bao" role="status" style={{ margin: "0 16px 12px" }}>
                  {soCanhBao} mặt hàng trên trang này đang hết hoặc dưới mức tối thiểu.{" "}
                  <Link href="/kho?canhBao=1">Xem riêng</Link>
                </div>
              )}
              <div className="cuon-ngang">
                <table className="bang">
                  <thead>
                    <tr>
                      <th>Hàng hóa</th>
                      <th>Kho</th>
                      <th className="so">Tồn kho</th>
                      <th className="so">Giữ chỗ</th>
                      <th className="so">Còn bán được</th>
                      <th className="an-tren-dt">Trạng thái</th>
                      <th className="an-tren-dt">Cập nhật</th>
                      {duocSua && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {kq.dong.map((d) => {
                      const cb = NHAN_CANH_BAO[d.mucCanhBao];
                      const dv = d.sanPham.donViTinh ? (tenDonVi[d.sanPham.donViTinh] ?? d.sanPham.donViTinh) : "";
                      return (
                        <tr key={d.id}>
                          <td>
                            {coQuyen(nd.hoSo, "product.view") ? <Link href={`/san-pham/${d.sanPham.id}`}>{d.sanPham.ten}</Link> : d.sanPham.ten}
                            <div className="dong-phu">
                              {d.sanPham.sku}
                              {d.sanPham.theoSerial ? " · theo số sê-ri" : ""}
                            </div>
                          </td>
                          <td>
                            {d.kho.ten}
                            <div className="dong-phu">{d.kho.ma}</div>
                          </td>
                          <td className="so">
                            {dinhDangSo(d.tonKho)} {dv}
                          </td>
                          <td className="so">{d.giuCho > 0 ? dinhDangSo(d.giuCho) : <span className="mo">—</span>}</td>
                          <td className="so">
                            <strong>{dinhDangSo(d.conBanDuoc)}</strong>
                            {d.mucToiThieu !== null && <div className="dong-phu">tối thiểu {dinhDangSo(d.mucToiThieu)}</div>}
                          </td>
                          <td className="an-tren-dt">
                            <span className={`huy-hieu ${cb.lop}`}>{cb.nhan}</span>
                          </td>
                          <td className="an-tren-dt nho">{dinhDangNgayGio(d.suaLuc)}</td>
                          {duocSua && (
                            <td>
                              <TacVuTonKho
                                khoId={d.kho.id}
                                khoTen={d.kho.ten}
                                sanPhamId={d.sanPham.id}
                                sanPhamTen={d.sanPham.ten}
                                tonHienTai={d.tonKho}
                                mucToiThieu={d.mucToiThieu}
                                duocSua={duocSua}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/kho" thamSo={{ q: boLoc.q, kho: boLoc.kho, canhBao: boLoc.canhBao }} />
        </section>
      )}
    </>
  );
}
