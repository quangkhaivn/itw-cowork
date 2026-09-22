import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgay, dinhDangNgayGio, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { homNayVN } from "@/modules/crm/chung";
import { chiTietHoaDonMua, NHAN_TINH_TRANG_TRA, NHAN_TRANG_THAI_HOA_DON_MUA } from "@/modules/cong-no-tra/service";
import { NHAN_PHUONG_THUC_THU } from "@/modules/tai-chinh/tinh-toan";
import TacVuHoaDonMua from "./TacVuHoaDonMua";
import KhungDinhKem from "@/components/dinh-kem/KhungDinhKem";

export const dynamic = "force-dynamic";

export default async function TrangChiTietHoaDonMua({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: ThamSoTrang;
}) {
  const nd = await yeuCauQuyen("finance.view");
  const { id } = await params;
  const sp = await searchParams;

  const du = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietHoaDonMua(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const hd = du.hoaDon;
  const moTao = layMot(sp.moTao) === "1";
  const coLech = hd.dong.some((d) => d.lechVoiNhan !== null && d.lechVoiNhan !== 0);

  return (
    <>
      <DauTrang
        tieuDe={hd.so}
        duongDan={[{ nhan: "Tài chính" }, { nhan: "Hóa đơn nhà cung cấp", href: "/tai-chinh/hoa-don-mua" }]}
        moTa={
          <>
            {hd.nhaCungCap.ten}
            {hd.soHoaDonNcc && ` · số ${hd.soHoaDonNcc}`}
            {hd.donMua && (
              <>
                {" · từ đơn mua "}
                <Link href={`/mua-hang/don-mua/${hd.donMua.id}`}>{hd.donMua.so}</Link>
              </>
            )}
          </>
        }
        hanhDong={
          <TacVuHoaDonMua
            id={hd.id}
            so={hd.so}
            nhaCungCapId={hd.nhaCungCap.id}
            duocGhiNhan={du.quyen.ghiNhan}
            duocChi={du.quyen.chiTien}
            duocHuy={du.quyen.huy}
            homNay={homNayVN()}
          />
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã lập hóa đơn {hd.so} ở trạng thái Nháp. Đối chiếu với số hàng đã nhận rồi bấm Ghi nhận.
        </div>
      )}

      {coLech && hd.trangThai === "DRAFT" && (
        <div className="hop-thong-bao canh-bao" role="status">
          Có dòng mà <strong>số trên hóa đơn khác số đã nhận</strong>. Kiểm tra lại trước khi ghi nhận — ghi nhận rồi
          thì khóa, không sửa được nữa.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Trạng thái</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            <span className={`huy-hieu ${NHAN_TRANG_THAI_HOA_DON_MUA[hd.trangThai]?.lop ?? ""}`}>
              {NHAN_TRANG_THAI_HOA_DON_MUA[hd.trangThai]?.nhan ?? hd.trangThai}
            </span>
          </div>
          {hd.ghiNhanLuc && <div className="ghi-chu">Ghi nhận lúc {dinhDangNgayGio(hd.ghiNhanLuc)}</div>}
          {hd.lyDoHuy && <div className="ghi-chu chu-loi">Lý do hủy: {hd.lyDoHuy}</div>}
        </div>
        <div className="the chi-so">
          <div className="nhan">Tổng tiền</div>
          <div className="gia-tri">{dinhDangTien(hd.tongCong)}</div>
          <div className="ghi-chu">
            Tạm tính {dinhDangTien(hd.tamTinh)} · VAT {dinhDangTien(hd.tongVat)}
          </div>
        </div>
        <div className={`the chi-so ${hd.conNo > 0 && hd.soNgayQuaHan > 0 ? "loi" : ""}`}>
          <div className="nhan">Còn phải trả</div>
          <div className="gia-tri">{dinhDangTien(hd.conNo)}</div>
          <div className="ghi-chu">
            {NHAN_TINH_TRANG_TRA[hd.tinhTrangTra] ?? hd.tinhTrangTra}
            {hd.daTra > 0 && ` · đã trả ${dinhDangTien(hd.daTra)}`}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Hạn thanh toán</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {hd.hanThanhToan ? dinhDangNgay(hd.hanThanhToan) : "—"}
          </div>
          <div className="ghi-chu">
            {hd.soNgayQuaHan > 0 ? (
              <span className="chu-loi">Quá hạn {dinhDangSo(hd.soNgayQuaHan)} ngày</span>
            ) : hd.ngayHoaDon ? (
              `Hóa đơn ngày ${dinhDangNgay(hd.ngayHoaDon)}`
            ) : (
              "Chưa ghi nhận"
            )}
          </div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Nội dung hóa đơn</h2>
        </div>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Hàng</th>
                <th className="so">Số lượng</th>
                <th className="so an-tren-dt">Đã nhận</th>
                <th className="so an-tren-dt">Đơn giá</th>
                <th className="so an-tren-dt">VAT</th>
                <th className="so">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {hd.dong.map((d) => (
                <tr key={d.id}>
                  <td className="so nho">{d.thuTu}</td>
                  <td>
                    <strong>{d.ten}</strong>
                    {d.sku && <div className="dong-phu">{d.sku}</div>}
                  </td>
                  <td className="so">
                    {d.soLuong}
                    {d.donViTinh ? ` ${d.donViTinh}` : ""}
                  </td>
                  <td className="so an-tren-dt nho">
                    {d.daNhan === null ? (
                      <span className="phu">—</span>
                    ) : (
                      <>
                        {d.daNhan}
                        {d.lechVoiNhan !== null && d.lechVoiNhan !== 0 && (
                          <div className="dong-phu chu-loi">lệch {d.lechVoiNhan > 0 ? "+" : ""}{d.lechVoiNhan}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="so an-tren-dt">{dinhDangTien(d.donGia)}</td>
                  <td className="so an-tren-dt nho">{d.vat}%</td>
                  <td className="so">{dinhDangTien(d.thanhTien)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hd.ghiChu && (
          <div className="than">
            <dl className="ds-mo-ta">
              <dt>Ghi chú</dt>
              <dd>{hd.ghiChu}</dd>
            </dl>
          </div>
        )}
      </section>

      <section className="the">
        <div className="dau">
          <h2>Phiếu chi đã trừ vào hóa đơn này</h2>
          <Link className="nho" href="/tai-chinh/phieu-chi">
            Tất cả phiếu chi
          </Link>
        </div>
        {hd.phieuChi.length === 0 ? (
          <TrongRong tieuDe="Chưa chi đồng nào">
            {hd.trangThai === "RECORDED"
              ? "Bấm Chi tiền khi trả nhà cung cấp — một phiếu chi trừ được cho nhiều hóa đơn."
              : "Hóa đơn phải được ghi nhận trước khi chi tiền."}
          </TrongRong>
        ) : (
          <table className="bang">
            <tbody>
              {hd.phieuChi.map((p) => (
                <tr key={p.id} className={p.trangThai === "huy" ? "mo" : undefined}>
                  <td>
                    <strong>{p.so}</strong>
                    <div className="dong-phu">{dinhDangNgay(p.ngayChi)}</div>
                  </td>
                  <td className="nho">{NHAN_PHUONG_THUC_THU[p.phuongThuc] ?? p.phuongThuc}</td>
                  <td className="so">{dinhDangTien(p.soTien)}</td>
                  <td className="nho">{p.trangThai === "huy" ? <span className="chu-loi">Đã hủy</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <KhungDinhKem loai="supplier_bill" doiTuongId={hd.id} moTa="Bản chụp hóa đơn nhà cung cấp gửi tới, biên bản đối chiếu, chứng từ vận chuyển." />
    </>
  );
}
