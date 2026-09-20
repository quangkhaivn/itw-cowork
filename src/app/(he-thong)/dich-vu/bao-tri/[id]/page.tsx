import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { homNayVN } from "@/modules/crm/chung";
import { chiTietHopDongBaoTri, NHAN_TINH_TRANG_KY, NHAN_TRANG_THAI_BAO_TRI } from "@/modules/bao-tri/service";
import { NHAN_TRANG_THAI_GIA_HAN } from "@/modules/bao-tri/service";
import TacVuHopDong from "./TacVuHopDong";

export const dynamic = "force-dynamic";

export default async function TrangChiTietBaoTri({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: ThamSoTrang;
}) {
  const nd = await yeuCauQuyen("service_desk.view");
  const { id } = await params;
  const sp = await searchParams;

  const du = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietHopDongBaoTri(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const h = du.hopDong;
  const moTao = layMot(sp.moTao) === "1";
  const homNay = homNayVN();

  return (
    <>
      <DauTrang
        tieuDe={h.ma}
        duongDan={[{ nhan: "Dịch vụ" }, { nhan: "Hợp đồng bảo trì", href: "/dich-vu/bao-tri" }]}
        moTa={
          <>
            {h.ten} · <Link href={`/crm/khach-hang/${h.khachHang.id}`}>{h.khachHang.ten}</Link> · Phụ trách:{" "}
            {h.nguoiPhuTrach.hoTen}
          </>
        }
        hanhDong={
          <TacVuHopDong
            id={h.id}
            ma={h.ma}
            duocGhiNhan={du.quyen.ghiNhanBaoTri}
            duocHuy={du.quyen.huy}
            homNay={homNay}
          />
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã lập hợp đồng {h.ma}. Từ kỳ đầu tiên trở đi hệ thống sẽ nhắc người phụ trách đúng ngày.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Trạng thái</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {NHAN_TRANG_THAI_BAO_TRI[h.trangThai]?.nhan ?? h.trangThai}
          </div>
          {h.lyDoHuy && <div className="ghi-chu chu-loi">Lý do hủy: {h.lyDoHuy}</div>}
        </div>
        <div className={`the chi-so ${h.tinhTrangKy === "tre-ky" ? "loi" : h.tinhTrangKy === "den-ky" ? "canh-bao" : ""}`}>
          <div className="nhan">Kỳ bảo trì kế tiếp</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {h.kyKeTiep ? dinhDangNgay(h.kyKeTiep) : "Hết kỳ hạn"}
          </div>
          <div className="ghi-chu">
            {NHAN_TINH_TRANG_KY[h.tinhTrangKy]?.nhan ?? h.tinhTrangKy}
            {h.soNgayToiKy !== null && h.soNgayToiKy > 0 && ` · còn ${dinhDangSo(h.soNgayToiKy)} ngày`}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Chu kỳ</div>
          <div className="gia-tri">{dinhDangSo(h.chuKyThang)}</div>
          <div className="ghi-chu">tháng một lần</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Giá trị hợp đồng</div>
          <div className="gia-tri">{h.giaTri ? dinhDangTien(h.giaTri) : "—"}</div>
        </div>
      </div>

      <div className="luoi-the">
        <section className="the">
          <div className="dau">
            <h2>Hợp đồng</h2>
          </div>
          <div className="than">
            <dl className="ds-mo-ta">
              <dt>Kỳ hạn</dt>
              <dd>
                {dinhDangNgay(h.ngayBatDau)} → {dinhDangNgay(h.ngayKetThuc)}
              </dd>
              <dt>Lần bảo trì gần nhất</dt>
              <dd>{h.lanBaoTriGanNhat ? dinhDangNgay(h.lanBaoTriGanNhat) : <span className="phu">Chưa bảo trì lần nào</span>}</dd>
              <dt>Phạm vi công việc</dt>
              <dd>{h.phamVi || <span className="phu">Chưa ghi</span>}</dd>
              <dt>Ghi chú</dt>
              <dd>{h.ghiChu || <span className="phu">—</span>}</dd>
            </dl>
          </div>
        </section>

        <section className="the">
          <div className="dau">
            <h2>Gia hạn liên quan</h2>
            <Link className="nho" href="/dich-vu/gia-han">
              Lịch gia hạn
            </Link>
          </div>
          {du.giaHan.length === 0 ? (
            <TrongRong tieuDe="Chưa có dòng gia hạn nào">
              Bản quét lập dòng gia hạn khi hợp đồng sắp hết kỳ hạn.
            </TrongRong>
          ) : (
            <table className="bang">
              <tbody>
                {du.giaHan.map((g) => (
                  <tr key={g.id}>
                    <td className="nho">{dinhDangNgay(g.denHan)}</td>
                    <td>
                      <span className={`huy-hieu ${NHAN_TRANG_THAI_GIA_HAN[g.trangThai]?.lop ?? ""}`}>
                        {NHAN_TRANG_THAI_GIA_HAN[g.trangThai]?.nhan ?? g.trangThai}
                      </span>
                    </td>
                    <td>
                      {g.coHoiId && <Link href={`/ban-hang/co-hoi/${g.coHoiId}`}>Xem cơ hội</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
