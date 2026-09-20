import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangPhanTram, dinhDangTien } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { luaChonDanhMuc } from "@/modules/danh-muc-san-pham/service";
import { luaChonNhaCungCap } from "@/modules/nha-cung-cap/service";
import { chiTietSanPham } from "@/modules/san-pham/service";
import FormSanPham from "../FormSanPham";
import BangGiaNguon from "./BangGiaNguon";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NHAN_LOAI_GIA: Record<string, string> = { cost: "Giá vốn", selling: "Giá bán", supplier: "Giá nhà cung cấp" };
const NHAN_NGUON: Record<string, string> = { "thu-cong": "nhập tay", "nhap-csv": "nhập CSV", "he-thong": "hệ thống" };

export default async function TrangChiTietSanPham({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("product.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const moTao = layMot((await searchParams).moTao) === "1";

  const duLieu = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const d = await chiTietSanPham(nc, id);
      const danhMuc = d.quyen.sua ? await luaChonDanhMuc(nc) : null;
      return {
        ...d,
        luaChon: danhMuc
          ? {
              nhom: danhMuc.nhom,
              thuongHieu: danhMuc.thuongHieu,
              donViTinh: (await luaChonDuLieuGoc(nc, ["don_vi_tinh"])).don_vi_tinh,
              nhaCungCap: coQuyen(nd.hoSo, "supplier.view") ? await luaChonNhaCungCap(nc) : [],
            }
          : null,
        dsNhaCungCap: coQuyen(nd.hoSo, "supplier.view") || d.quyen.datGia ? await luaChonNhaCungCap(nc) : [],
      };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!duLieu) notFound();
  const { sanPham, giaNguon, nenMua, lichSuGia, quyen, luaChon, dsNhaCungCap } = duLieu;

  return (
    <>
      <DauTrang
        tieuDe={sanPham.ten}
        duongDan={[{ nhan: "Sản phẩm", href: "/san-pham" }]}
        moTa={
          <>
            {sanPham.sku}
            {sanPham.model && ` · ${sanPham.model}`}
            {sanPham.nhom && ` · ${sanPham.nhom.name}`}
            {sanPham.thuongHieu && ` · ${sanPham.thuongHieu.name}`} ·{" "}
            <span className={`huy-hieu ${sanPham.trangThai === "hoat-dong" ? "tot" : ""}`}>
              {sanPham.trangThai === "hoat-dong" ? "Đang kinh doanh" : "Ngừng kinh doanh"}
            </span>
          </>
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã tạo sản phẩm {sanPham.sku}. Thêm nguồn hàng bên dưới để biết giá vốn khi làm báo giá.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Giá bán</div>
          <div className="gia-tri">{sanPham.giaBan ? dinhDangTien(sanPham.giaBan) : "Chưa có"}</div>
          <div className="ghi-chu">VAT {dinhDangPhanTram(sanPham.vat)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Giá vốn tham chiếu</div>
          <div className="gia-tri">{sanPham.giaVon ? dinhDangTien(sanPham.giaVon) : "Chưa có"}</div>
          <div className="ghi-chu">{sanPham.bienLoiNhuan === null ? "Chưa tính được biên" : `Biên lợi nhuận ${dinhDangPhanTram(sanPham.bienLoiNhuan)}`}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Nguồn nên mua</div>
          <div className="gia-tri" style={{ fontSize: 16 }}>{nenMua ? nenMua.nhaCungCap.ten : "Chưa có nguồn"}</div>
          <div className="ghi-chu">{nenMua ? dinhDangTien(nenMua.giaMua) : "Thêm nhà cung cấp ở bảng giá"}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Bảo hành</div>
          <div className="gia-tri" style={{ fontSize: 16 }}>{sanPham.baoHanhThang ? `${sanPham.baoHanhThang} tháng` : "—"}</div>
          <div className="ghi-chu">{sanPham.batBuocSerial ? "Có quản lý số sê-ri" : "Không quản lý sê-ri"}</div>
        </div>
      </div>

      <div className="luoi-ben-phai">
        <div>
          {quyen.sua && luaChon ? (
            <FormSanPham
              luaChon={luaChon}
              banDau={{
                id: sanPham.id,
                sku: sanPham.sku,
                ten: sanPham.ten,
                nhomId: sanPham.nhom?.id ?? "",
                thuongHieuId: sanPham.thuongHieu?.id ?? "",
                model: sanPham.model ?? "",
                donViTinh: sanPham.donViTinh ?? "",
                giaVon: sanPham.giaVon ?? "",
                giaBan: sanPham.giaBan ?? "",
                vat: sanPham.vat,
                baoHanhThang: sanPham.baoHanhThang != null ? String(sanPham.baoHanhThang) : "",
                batBuocSerial: sanPham.batBuocSerial,
                nhaCungCapMacDinhId: sanPham.nhaCungCapMacDinh?.id ?? "",
                moTa: sanPham.moTa ?? "",
                thongSo: Object.entries(sanPham.thongSo ?? {}),
                trangThai: sanPham.trangThai,
              }}
            />
          ) : (
            <section className="the">
              <div className="dau">
                <h2>Thông tin</h2>
              </div>
              <dl className="bang-thong-tin">
                <dt>SKU</dt>
                <dd>{sanPham.sku}</dd>
                <dt>Đơn vị tính</dt>
                <dd>{sanPham.donViTinh ?? "—"}</dd>
                <dt>Mô tả</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{sanPham.moTa ?? "—"}</dd>
                {Object.entries(sanPham.thongSo ?? {}).map(([k, v]) => (
                  <span key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </span>
                ))}
              </dl>
            </section>
          )}

          <BangGiaNguon
            sanPhamId={sanPham.id}
            giaNguon={giaNguon}
            nhaCungCap={dsNhaCungCap}
            duocSua={quyen.datGia}
            xemNhaCungCap={quyen.xemNhaCungCap}
          />
        </div>

        <div>
          <section className="the">
            <div className="dau">
              <h2>Lịch sử giá</h2>
              <span className="phu nho">Chỉ ghi thêm</span>
            </div>
            {lichSuGia.length === 0 ? (
              <TrongRong tieuDe="Chưa có thay đổi giá" />
            ) : (
              <table className="bang">
                <tbody>
                  {lichSuGia.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <strong style={{ fontWeight: 600 }}>{NHAN_LOAI_GIA[h.loai] ?? h.loai}</strong>
                        {h.nhaCungCap && <span className="phu"> · {h.nhaCungCap.name}</span>}
                        <div className="dong-phu">
                          {h.giaCu ? dinhDangTien(h.giaCu) : "chưa có"} → {h.giaMoi ? dinhDangTien(h.giaMoi) : "gỡ nguồn"}
                        </div>
                        <div className="dong-phu">
                          {dinhDangNgayGio(h.luc)} · {h.nguoi} · {NHAN_NGUON[h.nguon] ?? h.nguon}
                          {h.lyDo ? ` · ${h.lyDo}` : ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {sanPham.nhaCungCapMacDinh && (
            <section className="the">
              <div className="dau">
                <h2>Nhà cung cấp mặc định</h2>
              </div>
              <div className="than">
                {quyen.xemNhaCungCap ? (
                  <Link href={`/san-pham/nha-cung-cap/${sanPham.nhaCungCapMacDinh.id}`}>{sanPham.nhaCungCapMacDinh.name}</Link>
                ) : (
                  sanPham.nhaCungCapMacDinh.name
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
