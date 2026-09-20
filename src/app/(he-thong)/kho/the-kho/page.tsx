import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocTheKho } from "@/modules/kho/luoc-do";
import { danhSachKho, theKho } from "@/modules/kho/service";
import { LOAI_GIAO_DICH, NHAN_LOAI_GIAO_DICH } from "@/modules/kho/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOP_LOAI: Record<string, string> = {
  nhap: "tot",
  xuat: "loi",
  "giu-cho": "canh-bao",
  "nha-giu-cho": "",
  "dieu-chinh": "chinh",
};

export default async function TrangTheKho({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("inventory.view");
  const sp = await searchParams;
  const loai = layMot(sp.loai);
  const boLoc = LuocDoLocTheKho.parse({
    sanPham: LA_UUID.test(layMot(sp.sanPham)) ? layMot(sp.sanPham) : "",
    kho: LA_UUID.test(layMot(sp.kho)) ? layMot(sp.kho) : "",
    loai: (LOAI_GIAO_DICH as readonly string[]).includes(loai) ? loai : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, kho } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { kq: await theKho(nc, boLoc), kho: await danhSachKho(nc) };
  });
  const coLoc = Boolean(boLoc.sanPham || boLoc.kho || boLoc.loai);

  return (
    <>
      <DauTrang
        tieuDe="Thẻ kho"
        duongDan={[{ nhan: "Kho" }, { nhan: "Tồn kho", href: "/kho" }]}
        moTa="Sổ cái của kho: mọi lần nhập, xuất, giữ chỗ, điều chỉnh. Chỉ ghi thêm — cơ sở dữ liệu chặn sửa và xóa."
      />

      <section className="the">
        <form className="bo-loc" method="get">
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
            <label htmlFor="loai">Loại giao dịch</label>
            <select id="loai" name="loai" defaultValue={boLoc.loai}>
              <option value="">Tất cả</option>
              {LOAI_GIAO_DICH.map((l) => (
                <option key={l} value={l}>
                  {NHAN_LOAI_GIAO_DICH[l]}
                </option>
              ))}
            </select>
          </div>
          {boLoc.sanPham && <input type="hidden" name="sanPham" value={boLoc.sanPham} />}
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/kho/the-kho">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có giao dịch khớp bộ lọc" : "Kho chưa có giao dịch nào"}>
            {!coLoc && "Nhập hàng vào kho để bắt đầu ghi thẻ kho."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Loại</th>
                  <th>Hàng hóa</th>
                  <th className="an-tren-dt">Kho</th>
                  <th className="so">Số lượng</th>
                  <th className="so">Tồn sau</th>
                  <th className="an-tren-dt">Chứng từ / lý do</th>
                  <th className="an-tren-dt">Người ghi</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((d) => (
                  <tr key={d.id}>
                    <td className="nho">{dinhDangNgayGio(d.luc)}</td>
                    <td>
                      <span className={`huy-hieu ${LOP_LOAI[d.loai] ?? ""}`}>{NHAN_LOAI_GIAO_DICH[d.loai] ?? d.loai}</span>
                    </td>
                    <td>
                      {coQuyen(nd.hoSo, "product.view") ? <Link href={`/san-pham/${d.sanPham.id}`}>{d.sanPham.ten}</Link> : d.sanPham.ten}
                      <div className="dong-phu">{d.sanPham.sku}</div>
                    </td>
                    <td className="an-tren-dt nho">{d.kho.ma}</td>
                    <td className="so">
                      {d.tonThayDoi !== 0 ? (
                        <span className={d.tonThayDoi < 0 ? "chu-loi" : undefined}>
                          {d.tonThayDoi > 0 ? "+" : ""}
                          {dinhDangSo(d.tonThayDoi)}
                        </span>
                      ) : (
                        <span className="mo">
                          {d.giuChoThayDoi > 0 ? "+" : ""}
                          {dinhDangSo(d.giuChoThayDoi)} giữ chỗ
                        </span>
                      )}
                    </td>
                    <td className="so">
                      {dinhDangSo(d.tonSau)}
                      {d.giuChoSau > 0 && <div className="dong-phu">giữ {dinhDangSo(d.giuChoSau)}</div>}
                    </td>
                    <td className="an-tren-dt nho">
                      {d.soChungTu && d.loaiChungTu === "don-hang" && d.chungTuId ? (
                        <Link href={`/ban-hang/don-hang/${d.chungTuId}`}>{d.soChungTu}</Link>
                      ) : (
                        d.soChungTu
                      )}
                      {d.lyDo && <div className="dong-phu">{d.lyDo}</div>}
                    </td>
                    <td className="an-tren-dt nho">{d.nguoi ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/kho/the-kho" thamSo={{ kho: boLoc.kho, loai: boLoc.loai, sanPham: boLoc.sanPham }} />
      </section>
    </>
  );
}
