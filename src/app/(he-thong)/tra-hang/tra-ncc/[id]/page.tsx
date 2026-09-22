import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgay, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauMotTrongCacQuyen, type ThamSoTrang } from "@/lib/trang";
import { chiTietTraHangMua } from "@/modules/tra-hang/service";
import { LOP_TRANG_THAI_TRA_HANG, NHAN_TRANG_THAI_TRA_MUA } from "@/modules/tra-hang/tinh-toan";
import TacVuTraHangMua from "./TacVuTraHangMua";
import KhungDinhKem from "@/components/dinh-kem/KhungDinhKem";

export const dynamic = "force-dynamic";

const QUYEN_XEM = ["purchasing.view", "finance.view"];

export default async function TrangChiTietTraNcc({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: ThamSoTrang;
}) {
  const nd = await yeuCauMotTrongCacQuyen(QUYEN_XEM);
  const { id } = await params;
  const sp = await searchParams;

  const du = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietTraHangMua(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
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
        duongDan={[{ nhan: "Trả hàng" }, { nhan: "Trả nhà cung cấp", href: "/tra-hang/tra-ncc" }]}
        moTa={
          <>
            {p.nhaCungCap.ten}
            {p.donMua && (
              <>
                {" · theo đơn mua "}
                <Link href={`/mua-hang/don-mua/${p.donMua.id}`}>{p.donMua.so}</Link>
              </>
            )}
            {" · Xuất từ kho "}
            {p.kho.ten}
          </>
        }
        hanhDong={
          <TacVuTraHangMua
            id={p.id}
            so={p.so}
            nhaCungCapId={p.nhaCungCap.id}
            tongCong={Number(p.tongCong)}
            duocXacNhan={du.quyen.xacNhan}
            duocChotTien={du.quyen.chotTien}
            duocHuy={du.quyen.huy}
          />
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã lập phiếu {p.so}. Khi hàng đóng gói xong và gửi đi, thủ kho bấm “Xác nhận đã trả hàng đi”.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Trạng thái</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            <span className={`huy-hieu ${LOP_TRANG_THAI_TRA_HANG[p.trangThai] ?? ""}`}>
              {NHAN_TRANG_THAI_TRA_MUA[p.trangThai] ?? p.trangThai}
            </span>
          </div>
          {p.lyDoHuy && <div className="ghi-chu chu-loi">Lý do hủy: {p.lyDoHuy}</div>}
        </div>
        <div className="the chi-so">
          <div className="nhan">Giá trị hàng trả</div>
          <div className="gia-tri">{dinhDangTien(p.tongCong)}</div>
          <div className="ghi-chu">
            Tạm tính {dinhDangTien(p.tamTinh)} · VAT {dinhDangTien(p.tongVat)}
          </div>
        </div>
        <div className={`the chi-so ${p.conGiamTruDuoc > 0 && p.trangThai === "CONFIRMED" ? "canh-bao" : ""}`}>
          <div className="nhan">Đã giảm trừ công nợ</div>
          <div className="gia-tri">{dinhDangTien(p.daGiamTru)}</div>
          <div className="ghi-chu">
            {p.conGiamTruDuoc > 0 ? `Còn ${dinhDangTien(p.conGiamTruDuoc)} chưa trừ vào hóa đơn nào` : "Đã trừ hết"}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Ngày trả</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {dinhDangNgay(p.ngayTra)}
          </div>
          <div className="ghi-chu">Người lập: {p.nguoiPhuTrach.hoTen}</div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Vì sao trả</h2>
        </div>
        <div className="than">
          <p style={{ margin: 0 }}>{p.lyDo}</p>
          {p.ghiChu && <p className="phu" style={{ marginBottom: 0 }}>{p.ghiChu}</p>}
        </div>
      </section>

      <section className="the">
        <div className="dau">
          <h2>Hàng gửi trả</h2>
        </div>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Hàng</th>
                <th className="so">SL</th>
                <th className="so an-tren-dt">Đơn giá</th>
                <th className="so an-tren-dt">VAT</th>
                <th className="so">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {p.dong.map((d) => (
                <tr key={d.id}>
                  <td className="so nho">{d.thuTu}</td>
                  <td>
                    <strong>{d.ten}</strong>
                    {d.sku && <div className="dong-phu">{d.sku}</div>}
                    {d.daNhanTrenDon && <div className="dong-phu phu">Đơn mua đã nhận {d.daNhanTrenDon}</div>}
                    {d.ghiChu && <div className="dong-phu phu">{d.ghiChu}</div>}
                    {!d.quanLyTon && <div className="dong-phu phu">Không quản lý tồn — trả không ghi vào kho</div>}
                  </td>
                  <td className="so">
                    {d.soLuong}
                    {d.donViTinh ? ` ${d.donViTinh}` : ""}
                  </td>
                  <td className="so an-tren-dt">{dinhDangTien(d.donGia)}</td>
                  <td className="so an-tren-dt nho">{d.vat}%</td>
                  <td className="so">{dinhDangTien(d.thanhTien)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="the">
        <div className="dau">
          <h2>Giảm trừ vào hóa đơn nhà cung cấp</h2>
        </div>
        {p.giamTru.length === 0 ? (
          <TrongRong tieuDe="Chưa giảm trừ vào hóa đơn nào">
            {p.trangThai === "CONFIRMED"
              ? "Hàng đã gửi đi. Kế toán bấm “Chốt tiền — giảm trừ công nợ” để trừ giá trị này vào hóa đơn đang nợ nhà cung cấp."
              : "Phiếu phải qua bước xuất hàng đi trước khi chốt tiền."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Hóa đơn</th>
                  <th className="so">Số tiền giảm trừ</th>
                </tr>
              </thead>
              <tbody>
                {p.giamTru.map((g) => (
                  <tr key={g.hoaDonId}>
                    <td>
                      <Link href={`/tai-chinh/hoa-don-mua/${g.hoaDonId}`}>{g.soHoaDon}</Link>
                    </td>
                    <td className="so">{dinhDangTien(g.soTien)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <KhungDinhKem loai="purchase_return" doiTuongId={p.id} moTa="Biên bản gửi trả, vận đơn nhà xe, thư trả lời của nhà cung cấp." />
    </>
  );
}
