import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgay, dinhDangNgayGio, dinhDangPhanTram } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { chiTietChuyenKho } from "@/modules/chuyen-kho/service";
import { LOP_TRANG_THAI_CHUYEN_KHO, NHAN_TRANG_THAI_CHUYEN_KHO } from "@/modules/chuyen-kho/tinh-toan";
import TacVuChuyenKho from "./TacVuChuyenKho";

export const dynamic = "force-dynamic";

export default async function TrangChiTietChuyenKho({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: ThamSoTrang;
}) {
  const nd = await yeuCauQuyen("inventory.view");
  const { id } = await params;
  const sp = await searchParams;

  const du = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietChuyenKho(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const p = du.phieu;
  const moTao = layMot(sp.moTao) === "1";

  return (
    <>
      <DauTrang
        tieuDe={p.so}
        duongDan={[{ nhan: "Kho" }, { nhan: "Chuyển kho nội bộ", href: "/kho/chuyen-kho" }]}
        moTa={
          <>
            {p.khoNguon.ten} <span className="phu">→</span> {p.khoDich.ten} · Người lập: {p.nguoiPhuTrach.hoTen}
          </>
        }
        hanhDong={
          <TacVuChuyenKho
            id={p.id}
            so={p.so}
            dong={p.dong.map((d) => ({ id: d.id, ten: d.ten, soLuong: d.soLuong, donViTinh: d.donViTinh }))}
            duocXuat={du.quyen.xuat}
            duocNhan={du.quyen.nhan}
            duocHuy={du.quyen.huy}
          />
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã lập phiếu {p.so}. Hàng chưa đi — bấm “Xuất khỏi kho nguồn” khi thật sự đóng hàng lên xe.
        </div>
      )}

      {p.trangThai === "IN_TRANSIT" && (
        <div className="hop-thong-bao canh-bao" role="status">
          Hàng đang trên đường: đã rời <strong>{p.khoNguon.ten}</strong> lúc {dinhDangNgayGio(p.xuatLuc)} và chưa tới{" "}
          <strong>{p.khoDich.ten}</strong>. Trong lúc này hàng không nằm ở kho nào, nên tồn tổng đang thấp hơn thực tế{" "}
          {p.tongKet.tongXuat} đơn vị.
        </div>
      )}

      {p.tongKet.coThieu && p.trangThai === "RECEIVED" && (
        <div className="hop-thong-bao loi" role="status">
          Nhận thiếu {p.tongKet.thieu} đơn vị so với số đã xuất. Lý do ghi ở từng dòng bên dưới.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Trạng thái</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            <span className={`huy-hieu ${LOP_TRANG_THAI_CHUYEN_KHO[p.trangThai] ?? ""}`}>
              {NHAN_TRANG_THAI_CHUYEN_KHO[p.trangThai] ?? p.trangThai}
            </span>
          </div>
          {p.lyDoHuy && <div className="ghi-chu chu-loi">Lý do hủy: {p.lyDoHuy}</div>}
        </div>
        <div className={`the chi-so ${p.tongKet.coThieu ? "loi" : ""}`}>
          <div className="nhan">Xuất / nhận</div>
          <div className="gia-tri">
            {p.tongKet.tongXuat} / {p.tongKet.tongNhan}
          </div>
          <div className="ghi-chu">
            {p.tongKet.coThieu ? `Thiếu ${p.tongKet.thieu} đơn vị` : `${dinhDangPhanTram(p.tongKet.phanTram)} đã nhận`}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Ngày chuyển</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {dinhDangNgay(p.ngayChuyen)}
          </div>
          <div className="ghi-chu">
            {p.xuatLuc ? `Xuất ${dinhDangNgayGio(p.xuatLuc)}` : "Chưa xuất"}
            {p.nhanLuc ? ` · Nhận ${dinhDangNgayGio(p.nhanLuc)}` : ""}
          </div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Vì sao chuyển</h2>
        </div>
        <div className="than">
          <p style={{ margin: 0 }}>{p.lyDo}</p>
          {p.ghiChu && (
            <p className="phu" style={{ marginBottom: 0 }}>
              {p.ghiChu}
            </p>
          )}
        </div>
      </section>

      <section className="the">
        <div className="dau">
          <h2>Hàng chuyển</h2>
          <Link className="nho" href={`/kho/the-kho?kho=${p.khoNguon.id}`}>
            Xem thẻ kho nguồn
          </Link>
        </div>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Hàng</th>
                <th className="so">Xuất</th>
                <th className="so">Nhận</th>
                <th className="an-tren-dt">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {p.dong.map((d) => (
                <tr key={d.id}>
                  <td className="so nho">{d.thuTu}</td>
                  <td>
                    <strong>{d.ten}</strong>
                    {d.sku && <div className="dong-phu">{d.sku}</div>}
                    {d.serial.length > 0 && (
                      <div className="dong-phu">
                        Sê-ri: {d.serial.map((s) => s.serial).join(", ")}
                      </div>
                    )}
                    {!d.quanLyTon && <div className="dong-phu phu">Không quản lý tồn — chuyển không ghi vào kho</div>}
                  </td>
                  <td className="so">
                    {d.soLuong}
                    {d.donViTinh ? ` ${d.donViTinh}` : ""}
                  </td>
                  <td className="so">
                    {p.trangThai === "RECEIVED" ? d.daNhan : <span className="phu">—</span>}
                    {d.thieu > 0 && <div className="dong-phu chu-loi">thiếu {d.thieu}</div>}
                  </td>
                  <td className="an-tren-dt nho">{d.ghiChu || <span className="phu">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
