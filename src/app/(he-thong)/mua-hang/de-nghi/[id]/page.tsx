import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgay, dinhDangNgayGio, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { chiTietDeNghi } from "@/modules/mua-hang/service";
import { LOP_TRANG_THAI_DE_NGHI, NHAN_TRANG_THAI_DE_NGHI, NHAN_TRANG_THAI_DON_MUA } from "@/modules/mua-hang/tinh-toan";
import TacVuDeNghi from "./TacVuDeNghi";

export const dynamic = "force-dynamic";

export default async function TrangChiTietDeNghi({
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
    try {
      return await chiTietDeNghi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const d = du.deNghi;
  const moTao = layMot(sp.moTao) === "1";

  return (
    <>
      <DauTrang
        tieuDe={d.so}
        duongDan={[{ nhan: "Mua hàng" }, { nhan: "Đề nghị mua", href: "/mua-hang/de-nghi" }]}
        moTa={
          <>
            Người đề nghị: {d.nguoiDeNghi.hoTen}
            {d.donBan && (
              <>
                {" · từ đơn bán "}
                <Link href={`/ban-hang/don-hang/${d.donBan.id}`}>{d.donBan.so}</Link>
              </>
            )}
          </>
        }
        hanhDong={
          <>
            {du.quyen.taoDonMua && (
              <Link className="nut chinh" href={`/mua-hang/don-mua/moi?deNghi=${d.id}`}>
                Tạo đơn mua
              </Link>
            )}
            {du.quyen.sua && (
              <Link className="nut" href={`/mua-hang/de-nghi/${d.id}/sua`}>
                Sửa
              </Link>
            )}
            <TacVuDeNghi
              id={d.id}
              so={d.so}
              duocXinDuyet={du.quyen.xinDuyet}
              duocDuyet={du.quyen.duyet}
              duocHuy={du.quyen.huy}
            />
          </>
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã lập đề nghị {d.so}. Kiểm tra lại rồi bấm Gửi duyệt.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Trạng thái</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            <span className={`huy-hieu ${LOP_TRANG_THAI_DE_NGHI[d.trangThai] ?? ""}`}>
              {NHAN_TRANG_THAI_DE_NGHI[d.trangThai] ?? d.trangThai}
            </span>
          </div>
          {d.duyetLuc && <div className="ghi-chu">Quyết định lúc {dinhDangNgayGio(d.duyetLuc)}</div>}
          {d.ghiChuQuyetDinh && <div className="ghi-chu">{d.ghiChuQuyetDinh}</div>}
          {d.lyDoHuy && <div className="ghi-chu chu-loi">Lý do hủy: {d.lyDoHuy}</div>}
        </div>
        <div className="the chi-so">
          <div className="nhan">Tổng dự kiến</div>
          <div className="gia-tri">{dinhDangTien(d.tongDuKien)}</div>
          <div className="ghi-chu">Giá dự kiến, chốt lại khi lập đơn mua</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Cần trước ngày</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {d.ngayCan ? dinhDangNgay(d.ngayCan) : "—"}
          </div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Hàng đề nghị mua</h2>
        </div>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Hàng</th>
                <th className="so">Số lượng</th>
                <th className="so an-tren-dt">Giá dự kiến</th>
                <th className="so">Thành tiền</th>
                <th className="an-tren-dt">Nguồn gợi ý</th>
              </tr>
            </thead>
            <tbody>
              {d.dong.map((x) => (
                <tr key={x.id}>
                  <td className="so nho">{x.thuTu}</td>
                  <td>
                    <strong>{x.ten}</strong>
                    {x.sku && <div className="dong-phu">{x.sku}</div>}
                    {x.ghiChu && <div className="dong-phu">{x.ghiChu}</div>}
                  </td>
                  <td className="so">
                    {x.soLuong}
                    {x.donViTinh ? ` ${x.donViTinh}` : ""}
                  </td>
                  <td className="so an-tren-dt">{dinhDangTien(x.giaDuKien)}</td>
                  <td className="so">{dinhDangTien(Number(x.soLuong) * Number(x.giaDuKien))}</td>
                  <td className="an-tren-dt nho">
                    {x.nhaCungCap ? (
                      <Link href={`/san-pham/nha-cung-cap/${x.nhaCungCap.id}`}>{x.nhaCungCap.ten}</Link>
                    ) : (
                      <span className="phu">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.lyDo && (
          <div className="than">
            <dl className="ds-mo-ta">
              <dt>Lý do đề nghị</dt>
              <dd>{d.lyDo}</dd>
              {d.ghiChu && (
                <>
                  <dt>Ghi chú</dt>
                  <dd>{d.ghiChu}</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </section>

      <section className="the">
        <div className="dau">
          <h2>Đơn mua sinh ra từ đề nghị này</h2>
        </div>
        {du.donMua.length === 0 ? (
          <TrongRong tieuDe="Chưa có đơn mua nào">
            {d.trangThai === "APPROVED"
              ? "Đề nghị đã được duyệt — bấm Tạo đơn mua để đặt nhà cung cấp."
              : "Đề nghị phải được duyệt trước khi đặt hàng."}
          </TrongRong>
        ) : (
          <table className="bang">
            <tbody>
              {du.donMua.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/mua-hang/don-mua/${o.id}`}>
                      <strong>{o.so}</strong>
                    </Link>
                  </td>
                  <td>{o.nhaCungCap}</td>
                  <td className="so">{dinhDangTien(o.tongCong)}</td>
                  <td>
                    <span className="huy-hieu">{NHAN_TRANG_THAI_DON_MUA[o.trangThai] ?? o.trangThai}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
