import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgay, dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietBaoHanh } from "@/modules/bao-hanh/service";
import { NHAN_MUC_BAO_HANH } from "@/modules/bao-hanh/tinh-toan";
import { LOP_TRANG_THAI_PHIEU, NHAN_TRANG_THAI_PHIEU } from "@/modules/ho-tro/tinh-toan";
import TacVuBaoHanh from "./TacVuBaoHanh";

export const dynamic = "force-dynamic";

export default async function TrangChiTietBaoHanh({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("service_desk.view");
  const { id } = await params;

  const ct = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      return await chiTietBaoHanh(nc, id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!ct) notFound();

  const b = ct.baoHanh;
  const m = NHAN_MUC_BAO_HANH[b.mucBaoHanh];
  const duocSua = coQuyen(nd.hoSo, "service_desk.update");

  return (
    <>
      <DauTrang
        tieuDe={b.serial ?? b.tenHang}
        duongDan={[{ nhan: "Dịch vụ" }, { nhan: "Bảo hành", href: "/dich-vu/bao-hanh" }]}
        moTa={
          <>
            {b.tenHang} · <Link href={`/crm/khach-hang/${b.khachHang.id}`}>{b.khachHang.ten}</Link>
            {b.sanPham && coQuyen(nd.hoSo, "product.view") && (
              <>
                {" · "}
                <Link href={`/san-pham/${b.sanPham.id}`}>{b.sanPham.sku}</Link>
              </>
            )}
          </>
        }
        hanhDong={
          coQuyen(nd.hoSo, "service_desk.create") && (
            <Link className="nut chinh" href={`/dich-vu/ho-tro/moi?khachHang=${b.khachHang.id}`}>
              Mở phiếu hỗ trợ
            </Link>
          )
        }
      />

      {b.mucBaoHanh === "het-han" && (
        <div className="hop-thong-bao canh-bao" role="status">
          Máy này đã hết bảo hành từ {dinhDangNgay(b.ngayHetHan)}. Việc sửa chữa sẽ tính phí — báo khách trước khi nhận.
        </div>
      )}
      {b.mucBaoHanh === "huy" && (
        <div className="hop-thong-bao loi" role="status">
          Bảo hành này đã hủy. {b.ghiChu}
        </div>
      )}

      {duocSua && (
        <section className="the" style={{ padding: 16 }}>
          <TacVuBaoHanh baoHanhId={b.id} soThang={b.soThang} ngayBatDau={b.ngayBatDau} daHuy={b.trangThai === "huy"} />
        </section>
      )}

      <div className="luoi-ben-phai">
        <div>
          <section className="the">
            <div className="dau">
              <h2>Phiếu hỗ trợ đã mở cho máy này</h2>
            </div>
            {ct.phieuHoTro.length === 0 ? (
              <TrongRong tieuDe="Chưa có phiếu nào">Máy chưa từng phải mang đi bảo hành hay sửa chữa.</TrongRong>
            ) : (
              <table className="bang">
                <thead>
                  <tr>
                    <th>Phiếu</th>
                    <th>Nội dung</th>
                    <th>Trạng thái</th>
                    <th className="an-tren-dt">Mở lúc</th>
                  </tr>
                </thead>
                <tbody>
                  {ct.phieuHoTro.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/dich-vu/ho-tro/${p.id}`}>{p.so}</Link>
                      </td>
                      <td>{p.tieuDe}</td>
                      <td>
                        <span className={`huy-hieu ${LOP_TRANG_THAI_PHIEU[p.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_PHIEU[p.trangThai] ?? p.trangThai}</span>
                      </td>
                      <td className="an-tren-dt nho">{dinhDangNgayGio(p.taoLuc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div>
          <section className="the">
            <div className="dau">
              <h2>Bảo hành</h2>
              <span className={`huy-hieu ${m.lop}`}>{m.nhan}</span>
            </div>
            <dl className="bang-thong-tin">
              <div>
                <dt>Số sê-ri</dt>
                <dd>{b.serial ?? <span className="mo">Hàng không quản lý sê-ri</span>}</dd>
              </div>
              <div>
                <dt>Thời hạn</dt>
                <dd>
                  {b.soThang > 0 ? `${b.soThang} tháng` : "Không bảo hành"}
                  <div className="dong-phu">
                    {dinhDangNgay(b.ngayBatDau)} → {dinhDangNgay(b.ngayHetHan)}
                  </div>
                </dd>
              </div>
              <div>
                <dt>Còn lại</dt>
                <dd>{b.soNgayConLai >= 0 ? `${dinhDangSo(b.soNgayConLai)} ngày` : <span className="chu-loi">Đã hết {dinhDangSo(-b.soNgayConLai)} ngày</span>}</dd>
              </div>
              <div>
                <dt>Đơn hàng</dt>
                <dd>
                  {b.donHang && coQuyen(nd.hoSo, "order.view") ? <Link href={`/ban-hang/don-hang/${b.donHang.id}`}>{b.donHang.so}</Link> : <span className="mo">—</span>}
                </dd>
              </div>
              <div>
                <dt>Phiếu xuất</dt>
                <dd>
                  {b.phieuXuat ? (
                    <>
                      {b.phieuXuat.so}
                      <div className="dong-phu">{dinhDangNgayGio(b.phieuXuat.luc)}</div>
                    </>
                  ) : (
                    <span className="mo">—</span>
                  )}
                </dd>
              </div>
              {b.ghiChu && (
                <div>
                  <dt>Ghi chú</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{b.ghiChu}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
