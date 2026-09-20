import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgay, dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { chiTietDuAn } from "@/modules/du-an/service";
import { LOP_TRANG_THAI_DU_AN, NHAN_TRANG_THAI_DU_AN } from "@/modules/du-an/tinh-toan";
import { LOP_TRANG_THAI_PHIEU, NHAN_TRANG_THAI_PHIEU } from "@/modules/ho-tro/tinh-toan";
import { NHAN_TRANG_THAI_VIEC, NHAN_UU_TIEN } from "@/modules/crm/hang-so";
import TacVuDuAn from "./TacVuDuAn";

export const dynamic = "force-dynamic";

export default async function TrangChiTietDuAn({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("project.view");
  const { id } = await params;
  const moTao = layMot((await searchParams).moTao) === "1";

  const ct = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      return await chiTietDuAn(nc, id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!ct) notFound();

  const d = ct.duAn;

  return (
    <>
      <DauTrang
        tieuDe={d.ten}
        duongDan={[{ nhan: "Dự án", href: "/du-an" }]}
        moTa={
          <>
            {d.ma} · <Link href={`/crm/khach-hang/${d.khachHang.id}`}>{d.khachHang.ten}</Link>
            {d.donHang && coQuyen(nd.hoSo, "order.view") && (
              <>
                {" · từ đơn "}
                <Link href={`/ban-hang/don-hang/${d.donHang.id}`}>{d.donHang.so}</Link>
              </>
            )}
            {" · Phụ trách: "}
            {d.nguoiPhuTrach.hoTen}
          </>
        }
        hanhDong={
          coQuyen(nd.hoSo, "service_desk.create") && (
            <Link className="nut" href={`/dich-vu/ho-tro/moi?khachHang=${d.khachHang.id}`}>
              Mở phiếu hỗ trợ
            </Link>
          )
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã mở dự án {d.ma}. Đánh dấu hạng mục xong dần; nghiệm thu mở khi mọi hạng mục đã xong.
        </div>
      )}
      {d.quaHan && (
        <div className="hop-thong-bao canh-bao" role="status">
          Dự án quá hạn dự kiến ({dinhDangNgay(d.ngayDuKien)}) mà chưa nghiệm thu.
        </div>
      )}
      {d.trangThai === "ACCEPTED" && (
        <div className="hop-thong-bao tot" role="status">
          Đã nghiệm thu {d.nghiemThuLuc ? dinhDangNgayGio(d.nghiemThuLuc) : ""}. {d.ghiChuNghiemThu}
        </div>
      )}
      {d.trangThai === "CANCELLED" && (
        <div className="hop-thong-bao loi" role="status">
          Dự án đã hủy. Lý do: {d.lyDoHuy}
        </div>
      )}

      <div className="luoi-ben-phai">
        <div>
          <TacVuDuAn duAnId={d.id} hangMuc={d.hangMuc} quyen={ct.quyen} tienDo={d.tienDo} />

          <section className="the">
            <div className="dau">
              <h2>Việc trong dự án</h2>
            </div>
            {ct.viec.length === 0 ? (
              <TrongRong tieuDe="Chưa giao việc nào trong dự án">Giao việc cho kỹ thuật ở màn hình Công việc, chọn dự án này.</TrongRong>
            ) : (
              <table className="bang">
                <thead>
                  <tr>
                    <th>Việc</th>
                    <th>Trạng thái</th>
                    <th className="an-tren-dt">Ưu tiên</th>
                    <th className="an-tren-dt">Hạn</th>
                    <th>Người làm</th>
                  </tr>
                </thead>
                <tbody>
                  {ct.viec.map((v) => (
                    <tr key={v.id}>
                      <td>{v.tieuDe}</td>
                      <td className="nho">{NHAN_TRANG_THAI_VIEC[v.trangThai] ?? v.trangThai}</td>
                      <td className="an-tren-dt nho">{NHAN_UU_TIEN[v.uuTien] ?? v.uuTien}</td>
                      <td className="an-tren-dt so nho">{v.han ? dinhDangNgayGio(v.han) : "—"}</td>
                      <td>{v.nguoi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {ct.phieuHoTro.length > 0 && (
            <section className="the">
              <div className="dau">
                <h2>Phiếu hỗ trợ liên quan</h2>
              </div>
              <table className="bang">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <div>
          <section className="the">
            <div className="dau">
              <h2>Thông tin</h2>
              <span className={`huy-hieu ${LOP_TRANG_THAI_DU_AN[d.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_DU_AN[d.trangThai] ?? d.trangThai}</span>
            </div>
            <dl className="bang-thong-tin">
              <div>
                <dt>Tiến độ</dt>
                <dd>
                  {d.tienDo.phanTram}%
                  <div className="dong-phu">
                    {d.tienDo.xong}/{d.tienDo.tong} hạng mục xong
                  </div>
                </dd>
              </div>
              <div>
                <dt>Bắt đầu</dt>
                <dd>{d.ngayBatDau ? dinhDangNgay(d.ngayBatDau) : <span className="mo">Chưa bắt đầu</span>}</dd>
              </div>
              <div>
                <dt>Hạn dự kiến</dt>
                <dd>{d.ngayDuKien ? dinhDangNgay(d.ngayDuKien) : <span className="mo">Chưa hẹn</span>}</dd>
              </div>
              <div>
                <dt>Nghiệm thu</dt>
                <dd>{d.nghiemThuLuc ? dinhDangNgayGio(d.nghiemThuLuc) : <span className="mo">Chưa nghiệm thu</span>}</dd>
              </div>
              {d.moTa && (
                <div>
                  <dt>Phạm vi</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{d.moTa}</dd>
                </div>
              )}
              <div>
                <dt>Mở lúc</dt>
                <dd>{dinhDangNgayGio(d.taoLuc)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
