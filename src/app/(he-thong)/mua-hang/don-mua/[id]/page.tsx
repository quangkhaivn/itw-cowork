import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgay, dinhDangPhanTram, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc, homNayVN } from "@/modules/crm/chung";
import { chiTietDonMua } from "@/modules/mua-hang/service";
import { LOP_TRANG_THAI_DON_MUA, NHAN_TRANG_THAI_DON_MUA } from "@/modules/mua-hang/tinh-toan";
import GhiHoaDonNhaCungCap from "./GhiHoaDonNhaCungCap";
import TacVuDonMua from "./TacVuDonMua";

export const dynamic = "force-dynamic";

export default async function TrangChiTietDonMua({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: ThamSoTrang;
}) {
  const nd = await yeuCauQuyen("purchasing.view");
  const { id } = await params;
  const sp = await searchParams;

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietDonMua(nc, id);
      const ten = await banDoTenDuLieuGoc(nc, ["dieu_khoan_thanh_toan"]);
      return { ct, tenDieuKhoan: ten.dieu_khoan_thanh_toan ?? {} };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const o = du.ct.donMua;
  const moTao = layMot(sp.moTao) === "1";

  return (
    <>
      <DauTrang
        tieuDe={o.so}
        duongDan={[{ nhan: "Mua hàng" }, { nhan: "Đơn mua", href: "/mua-hang/don-mua" }]}
        moTa={
          <>
            {o.nhaCungCap.ten}
            {o.deNghi && (
              <>
                {" · từ đề nghị "}
                <Link href={`/mua-hang/de-nghi/${o.deNghi.id}`}>{o.deNghi.so}</Link>
              </>
            )}
            {" · Nhận về "}
            {o.kho.ten}
          </>
        }
        hanhDong={
          <>
            {du.ct.quyen.sua && (
              <Link className="nut" href={`/mua-hang/don-mua/${o.id}/sua`}>
                Sửa
              </Link>
            )}
            {coQuyen(nd.hoSo, "finance.create") && o.trangThai !== "DRAFT" && o.trangThai !== "CANCELLED" && (
              <GhiHoaDonNhaCungCap donMuaId={o.id} />
            )}
            {coQuyen(nd.hoSo, "purchasing.update") && o.tienDo.tongDaNhan > 0 && (
              <Link className="nut" href={`/tra-hang/tra-ncc/moi?don=${o.id}`}>
                Trả hàng nhà cung cấp
              </Link>
            )}
            <TacVuDonMua
              id={o.id}
              so={o.so}
              dong={o.dong.map((x) => ({
                id: x.id,
                ten: x.ten,
                soLuong: x.soLuong,
                donViTinh: x.donViTinh,
                donGia: x.donGia,
                conPhaiNhan: x.conPhaiNhan,
                theoSerial: x.theoSerial,
              }))}
              duocGui={du.ct.quyen.gui}
              duocXacNhan={du.ct.quyen.xacNhan}
              duocNhan={du.ct.quyen.nhanHang}
              duocHuy={du.ct.quyen.huy}
              homNay={homNayVN()}
            />
          </>
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã lập đơn mua {o.so}. Kiểm tra lại rồi bấm Gửi nhà cung cấp.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Trạng thái</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            <span className={`huy-hieu ${LOP_TRANG_THAI_DON_MUA[o.trangThai] ?? ""}`}>
              {NHAN_TRANG_THAI_DON_MUA[o.trangThai] ?? o.trangThai}
            </span>
          </div>
          {o.lyDoHuy && <div className="ghi-chu chu-loi">Lý do hủy: {o.lyDoHuy}</div>}
        </div>
        <div className="the chi-so">
          <div className="nhan">Tổng tiền</div>
          <div className="gia-tri">{dinhDangTien(o.tongCong)}</div>
          <div className="ghi-chu">
            Tạm tính {dinhDangTien(o.tamTinh)} · VAT {dinhDangTien(o.tongVat)}
          </div>
        </div>
        <div className={`the chi-so ${o.tienDo.xongHet ? "" : "canh-bao"}`}>
          <div className="nhan">Tiến độ nhận</div>
          <div className="gia-tri">{dinhDangPhanTram(o.tienDo.phanTram)}</div>
          <div className="ghi-chu">
            Đã nhận {o.tienDo.tongDaNhan} / {o.tienDo.tongDat}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Hẹn giao</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {o.ngayHenGiao ? dinhDangNgay(o.ngayHenGiao) : "—"}
          </div>
          <div className="ghi-chu">Đặt ngày {dinhDangNgay(o.ngayDat)}</div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Hàng đặt mua</h2>
        </div>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Hàng</th>
                <th className="so">Đặt</th>
                <th className="so">Đã nhận</th>
                <th className="so an-tren-dt">Đơn giá</th>
                <th className="so an-tren-dt">VAT</th>
                <th className="so">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {o.dong.map((x) => (
                <tr key={x.id}>
                  <td className="so nho">{x.thuTu}</td>
                  <td>
                    <strong>{x.ten}</strong>
                    {x.sku && <div className="dong-phu">{x.sku}</div>}
                    {x.theoSerial && <div className="dong-phu phu">Quản lý theo số sê-ri</div>}
                    {!x.quanLyTon && <div className="dong-phu phu">Không quản lý tồn — nhận không ghi vào kho</div>}
                  </td>
                  <td className="so">
                    {x.soLuong}
                    {x.donViTinh ? ` ${x.donViTinh}` : ""}
                  </td>
                  <td className="so">
                    {x.daNhan}
                    {x.conPhaiNhan > 0 && <div className="dong-phu chu-loi">còn {x.conPhaiNhan}</div>}
                  </td>
                  <td className="so an-tren-dt">{dinhDangTien(x.donGia)}</td>
                  <td className="so an-tren-dt nho">{x.vat}%</td>
                  <td className="so">{dinhDangTien(x.thanhTien)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="than">
          <dl className="ds-mo-ta">
            <dt>Điều khoản thanh toán</dt>
            <dd>
              {o.dieuKhoanThanhToan ? (du.tenDieuKhoan[o.dieuKhoanThanhToan] ?? o.dieuKhoanThanhToan) : <span className="phu">—</span>}
            </dd>
            <dt>Ghi chú</dt>
            <dd>{o.ghiChu || <span className="phu">—</span>}</dd>
          </dl>
        </div>
      </section>

      <section className="the">
        <div className="dau">
          <h2>Phiếu nhận hàng</h2>
          <Link className="nho" href={`/kho/the-kho?sanPham=`}>
            Xem thẻ kho
          </Link>
        </div>
        {du.ct.phieuNhan.length === 0 ? (
          <TrongRong tieuDe="Chưa nhận hàng lần nào">
            Khi hàng về, bấm Nhận hàng — hệ thống ghi thẳng vào sổ kho, không phải nhập kho lần nữa.
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Phiếu</th>
                  <th>Ngày nhận</th>
                  <th>Nội dung</th>
                  <th className="an-tren-dt">Chứng từ nhà cung cấp</th>
                </tr>
              </thead>
              <tbody>
                {du.ct.phieuNhan.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.so}</strong>
                    </td>
                    <td className="nho">{dinhDangNgay(p.ngayNhan)}</td>
                    <td className="nho">
                      {p.dong.map((x, i) => (
                        <div key={i}>
                          {x.ten} · {x.soLuong}
                        </div>
                      ))}
                    </td>
                    <td className="an-tren-dt nho">{p.soChungTuNcc || <span className="phu">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
