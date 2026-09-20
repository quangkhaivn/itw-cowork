import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import NutXuatCsv from "@/components/crm/NutXuatCsv";
import { taoNguCanh } from "@/lib/api";
import { dinhDangPhanTram, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { luaChonDanhMuc } from "@/modules/danh-muc-san-pham/service";
import { LuocDoLocSanPham } from "@/modules/san-pham/luoc-do";
import { danhSachSanPham } from "@/modules/san-pham/service";
import { luaChonNhaCungCap } from "@/modules/nha-cung-cap/service";

export const dynamic = "force-dynamic";

const SAP_XEP: { ma: string; nhan: string }[] = [
  { ma: "moi-nhat", nhan: "Mới cập nhật" },
  { ma: "ten", nhan: "Tên A→Z" },
  { ma: "sku", nhan: "SKU A→Z" },
  { ma: "gia-tang", nhan: "Giá bán tăng dần" },
  { ma: "gia-giam", nhan: "Giá bán giảm dần" },
];

export default async function TrangSanPham({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("product.view");
  const sp = await searchParams;
  const uuid = (x: string) => (/^[0-9a-f-]{36}$/i.test(x) ? x : "");
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocSanPham.parse({
    q: layMot(sp.q),
    nhom: uuid(layMot(sp.nhom)),
    thuongHieu: uuid(layMot(sp.thuongHieu)),
    nhaCungCap: uuid(layMot(sp.nhaCungCap)),
    trangThai: tt === "tat-ca" ? "" : ["hoat-dong", "ngung-kinh-doanh"].includes(tt) ? tt : "hoat-dong",
    thieuGia: layMot(sp.thieuGia) === "1" ? "1" : "",
    sapXep: SAP_XEP.some((x) => x.ma === layMot(sp.sapXep)) ? (layMot(sp.sapXep) as never) : "moi-nhat",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, danhMuc, nhaCungCap } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      kq: await danhSachSanPham(nc, boLoc),
      danhMuc: await luaChonDanhMuc(nc),
      nhaCungCap: coQuyen(nd.hoSo, "supplier.view") ? await luaChonNhaCungCap(nc) : [],
    };
  });

  const thamSo = {
    q: boLoc.q,
    nhom: boLoc.nhom,
    thuongHieu: boLoc.thuongHieu,
    nhaCungCap: boLoc.nhaCungCap,
    trangThai: boLoc.trangThai || "tat-ca",
    thieuGia: boLoc.thieuGia,
    sapXep: boLoc.sapXep,
  };
  const coLoc = Boolean(boLoc.q || boLoc.nhom || boLoc.thuongHieu || boLoc.nhaCungCap || boLoc.thieuGia || boLoc.trangThai !== "hoat-dong");

  return (
    <>
      <DauTrang
        tieuDe="Sản phẩm"
        moTa="Danh mục hàng hóa và dịch vụ bán ra, kèm giá bán và các nguồn mua. Báo giá ở Phase 4 sẽ lấy giá từ đây."
        hanhDong={
          <>
            {coQuyen(nd.hoSo, "product.export") && <NutXuatCsv url={`/api/v1/san-pham/xuat?${new URLSearchParams(thamSo).toString()}`} />}
            {coQuyen(nd.hoSo, "product.update") && (
              <Link className="nut" href="/san-pham/nhap-csv">
                <BieuTuong ten="nhap-csv" co={16} /> Nhập CSV
              </Link>
            )}
            {coQuyen(nd.hoSo, "product.create") && (
              <Link className="nut chinh" href="/san-pham/moi">
                <BieuTuong ten="them" co={16} /> Thêm sản phẩm
              </Link>
            )}
          </>
        }
      />

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="SKU, tên, model" />
          </div>
          <div className="truong">
            <label htmlFor="nhom">Nhóm</label>
            <select id="nhom" name="nhom" defaultValue={boLoc.nhom}>
              <option value="">Tất cả</option>
              {danhMuc.nhom.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.chaId ? `— ${n.ten}` : n.ten}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="thuongHieu">Thương hiệu</label>
            <select id="thuongHieu" name="thuongHieu" defaultValue={boLoc.thuongHieu}>
              <option value="">Tất cả</option>
              {danhMuc.thuongHieu.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ten}
                </option>
              ))}
            </select>
          </div>
          {nhaCungCap.length > 0 && (
            <div className="truong">
              <label htmlFor="nhaCungCap">Có nguồn từ</label>
              <select id="nhaCungCap" name="nhaCungCap" defaultValue={boLoc.nhaCungCap}>
                <option value="">Mọi nhà cung cấp</option>
                {nhaCungCap.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.ten}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "tat-ca"}>
              <option value="hoat-dong">Đang kinh doanh</option>
              <option value="ngung-kinh-doanh">Ngừng kinh doanh</option>
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <div className="truong">
            <label htmlFor="sapXep">Sắp xếp</label>
            <select id="sapXep" name="sapXep" defaultValue={boLoc.sapXep}>
              {SAP_XEP.map((s) => (
                <option key={s.ma} value={s.ma}>
                  {s.nhan}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label className="o-chon" style={{ minHeight: 34, alignItems: "center" }}>
              <input type="checkbox" name="thieuGia" value="1" defaultChecked={boLoc.thieuGia === "1"} />
              <span>Chưa có giá bán</span>
            </label>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/san-pham">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có sản phẩm khớp bộ lọc" : "Chưa có sản phẩm nào"}>
            {!coLoc && coQuyen(nd.hoSo, "product.update")
              ? "Thêm từng sản phẩm, hoặc nhập cả bảng giá bằng tệp CSV."
              : null}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th className="an-tren-dt">Nhóm · Thương hiệu</th>
                  <th className="so">Giá vốn</th>
                  <th className="so">Giá bán</th>
                  <th className="so an-tren-dt">Biên LN</th>
                  <th className="so">Nguồn</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((p) => (
                  <tr key={p.id} className={p.trangThai !== "hoat-dong" ? "mo" : undefined}>
                    <td>
                      <Link href={`/san-pham/${p.id}`}>{p.ten}</Link>
                      <div className="dong-phu">
                        {p.sku}
                        {p.model ? ` · ${p.model}` : ""}
                      </div>
                    </td>
                    <td className="an-tren-dt">
                      {p.nhom?.name ?? <span className="mo">—</span>}
                      {p.thuongHieu && <div className="dong-phu">{p.thuongHieu.name}</div>}
                    </td>
                    <td className="so">{p.giaVon ? dinhDangTien(p.giaVon) : <span className="mo">—</span>}</td>
                    <td className="so">{p.giaBan ? dinhDangTien(p.giaBan) : <span className="huy-hieu canh-bao">Chưa có</span>}</td>
                    <td className="so an-tren-dt">{p.bienLoiNhuan === null ? <span className="mo">—</span> : dinhDangPhanTram(p.bienLoiNhuan)}</td>
                    <td className="so">{p.soNguon ? dinhDangSo(p.soNguon) : <span className="mo">0</span>}</td>
                    <td>
                      <span className={`huy-hieu ${p.trangThai === "hoat-dong" ? "tot" : ""}`}>
                        {p.trangThai === "hoat-dong" ? "Đang kinh doanh" : "Ngừng"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/san-pham" thamSo={thamSo} />
      </section>
    </>
  );
}
