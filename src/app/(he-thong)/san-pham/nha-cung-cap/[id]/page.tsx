import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangTien } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { banDoTenDuLieuGoc, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { chiTietNhaCungCap } from "@/modules/nha-cung-cap/service";
import { NHAN_TRANG_THAI_HANG } from "@/modules/san-pham/chuan-hoa";
import FormNhaCungCap from "../FormNhaCungCap";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangChiTietNhaCungCap({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("supplier.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();

  const duLieu = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const d = await chiTietNhaCungCap(nc, id);
      return {
        ...d,
        dieuKhoan: (await luaChonDuLieuGoc(nc, ["dieu_khoan_thanh_toan"])).dieu_khoan_thanh_toan,
        tenDieuKhoan: (await banDoTenDuLieuGoc(nc, ["dieu_khoan_thanh_toan"])).dieu_khoan_thanh_toan,
      };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!duLieu) notFound();
  const { nhaCungCap: n, matHang, doiGiaGanDay, quyen, dieuKhoan, tenDieuKhoan } = duLieu;

  return (
    <>
      <DauTrang
        tieuDe={n.ten}
        duongDan={[{ nhan: "Sản phẩm", href: "/san-pham" }, { nhan: "Nhà cung cấp", href: "/san-pham/nha-cung-cap" }]}
        moTa={
          <>
            {n.ma}
            {n.maSoThue && ` · MST ${n.maSoThue}`} ·{" "}
            <span className={`huy-hieu ${n.trangThai === "hoat-dong" ? "tot" : ""}`}>{n.trangThai === "hoat-dong" ? "Đang hợp tác" : "Ngừng"}</span>
          </>
        }
        hanhDong={
          quyen.sua && (
            <FormNhaCungCap
              lopNut="nut"
              nhanNut="Sửa thông tin"
              dieuKhoan={dieuKhoan}
              banDau={{
                id: n.id,
                ten: n.ten,
                maSoThue: n.maSoThue ?? "",
                nguoiLienHe: n.nguoiLienHe ?? "",
                dienThoai: n.dienThoai ?? "",
                email: n.email ?? "",
                diaChi: n.diaChi ?? "",
                website: n.website ?? "",
                dieuKhoanThanhToan: n.dieuKhoanThanhToan ?? "",
                soNgayGiao: n.soNgayGiao != null ? String(n.soNgayGiao) : "",
                ghiChu: n.ghiChu ?? "",
                trangThai: n.trangThai,
              }}
            />
          )
        }
      />

      <div className="luoi-ben-phai">
        <div>
          <section className="the">
            <div className="dau">
              <h2>Mặt hàng đang báo giá</h2>
              <span className="phu nho">{matHang.length} dòng</span>
            </div>
            {!quyen.xemGia ? (
              <div className="than phu">Bạn không có quyền xem bảng giá sản phẩm.</div>
            ) : matHang.length === 0 ? (
              <TrongRong tieuDe="Chưa có mặt hàng nào">Thêm giá của nhà cung cấp này trong trang từng sản phẩm.</TrongRong>
            ) : (
              <div className="cuon-ngang">
                <table className="bang">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th className="so">Giá mua</th>
                      <th>Tình trạng</th>
                      <th className="an-tren-dt">Cập nhật</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matHang.map((m) => (
                      <tr key={m.id} className={m.sanPham.status !== "hoat-dong" ? "mo" : undefined}>
                        <td>
                          <Link href={`/san-pham/${m.sanPham.id}`}>{m.sanPham.name}</Link>
                          <div className="dong-phu">{m.sanPham.sku}</div>
                        </td>
                        <td className="so">{dinhDangTien(m.giaMua)}</td>
                        <td>
                          <span className="huy-hieu">{NHAN_TRANG_THAI_HANG[m.tinhTrang] ?? m.tinhTrang}</span>
                        </td>
                        <td className="an-tren-dt so nho">{dinhDangNgayGio(m.capNhatLuc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="the">
            <div className="dau">
              <h2>Thông tin</h2>
            </div>
            <dl className="bang-thong-tin">
              <dt>Người liên hệ</dt>
              <dd>{n.nguoiLienHe ?? "—"}</dd>
              <dt>Điện thoại</dt>
              <dd>{n.dienThoai ? <a href={`tel:${n.dienThoai.replace(/\s/g, "")}`}>{n.dienThoai}</a> : "—"}</dd>
              <dt>Email</dt>
              <dd>{n.email ? <a href={`mailto:${n.email}`}>{n.email}</a> : "—"}</dd>
              <dt>Địa chỉ</dt>
              <dd>{n.diaChi ?? "—"}</dd>
              <dt>Website</dt>
              <dd>{n.website ?? "—"}</dd>
              <dt>Thanh toán</dt>
              <dd>{n.dieuKhoanThanhToan ? (tenDieuKhoan[n.dieuKhoanThanhToan] ?? n.dieuKhoanThanhToan) : "—"}</dd>
              <dt>Giao hàng</dt>
              <dd>{n.soNgayGiao != null ? `${n.soNgayGiao} ngày` : "—"}</dd>
              <dt>Ghi chú</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>{n.ghiChu ?? "—"}</dd>
            </dl>
          </section>
          <section className="the">
            <div className="dau">
              <h2>Đổi giá gần đây</h2>
            </div>
            {doiGiaGanDay.length === 0 ? (
              <div className="than phu">Chưa có thay đổi giá nào.</div>
            ) : (
              <table className="bang">
                <tbody>
                  {doiGiaGanDay.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <Link href={`/san-pham/${h.sanPham.id}`}>{h.sanPham.sku}</Link>
                        <div className="dong-phu">
                          {h.giaCu ? dinhDangTien(h.giaCu) : "chưa có"} → {h.giaMoi ? dinhDangTien(h.giaMoi) : "gỡ nguồn"}
                        </div>
                        <div className="dong-phu">{dinhDangNgayGio(h.luc)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
