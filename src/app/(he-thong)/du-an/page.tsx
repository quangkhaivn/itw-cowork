import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { LuocDoLocDuAn } from "@/modules/du-an/luoc-do";
import { danhSachDuAn } from "@/modules/du-an/service";
import { LOP_TRANG_THAI_DU_AN, NHAN_TRANG_THAI_DU_AN, TRANG_THAI_DU_AN } from "@/modules/du-an/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangDuAn({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("project.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocDuAn.parse({
    q: layMot(sp.q),
    // "dang-chay" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "dang-chay" ? "" : tt === "tat-ca" || (TRANG_THAI_DU_AN as readonly string[]).includes(tt) ? tt : "",
    nguoiPhuTrach: LA_UUID.test(layMot(sp.nguoiPhuTrach)) ? layMot(sp.nguoiPhuTrach) : "",
    quaHan: layMot(sp.quaHan) === "1" ? "1" : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, nguoi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { kq: await danhSachDuAn(nc, boLoc), nguoi: await danhSachNguoiPhuTrach(nc, "project.view") };
  });
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.nguoiPhuTrach || boLoc.quaHan);

  return (
    <>
      <DauTrang
        tieuDe="Dự án triển khai"
        duongDan={[{ nhan: "Dự án" }]}
        moTa="Việc lắp đặt, thi công, chuyển giao sau khi khách chốt đơn. Chia thành hạng mục và kết thúc bằng nghiệm thu."
        hanhDong={
          coQuyen(nd.hoSo, "project.create") && (
            <Link className="nut chinh" href="/du-an/moi">
              <BieuTuong ten="them" co={16} /> Mở dự án
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Dự án đang chạy</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.dangChay)}</div>
        </div>
        <div className={`the chi-so${kq.tomTat.quaHan > 0 ? " canh-bao" : ""}`}>
          <div className="nhan">Quá hạn dự kiến</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.quaHan)}</div>
          <div className="ghi-chu">{kq.tomTat.quaHan > 0 ? <Link href="/du-an?quaHan=1">Xem dự án quá hạn</Link> : "Đang đúng tiến độ"}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Đã nghiệm thu</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.daNghiemThu)}</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Mã dự án, tên dự án, tên khách" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-chay"}>
              <option value="dang-chay">Đang chạy</option>
              <option value="tat-ca">Tất cả</option>
              {TRANG_THAI_DU_AN.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_DU_AN[t]}
                </option>
              ))}
            </select>
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiPhuTrach">Phụ trách</label>
              <select id="nguoiPhuTrach" name="nguoiPhuTrach" defaultValue={boLoc.nguoiPhuTrach}>
                <option value="">Tất cả</option>
                {nguoi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="truong">
            <label className="o-chon" style={{ minHeight: 34, alignItems: "center" }}>
              <input type="checkbox" name="quaHan" value="1" defaultChecked={boLoc.quaHan === "1"} />
              <span>Chỉ quá hạn</span>
            </label>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/du-an">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có dự án khớp bộ lọc" : "Chưa có dự án nào"}>
            {!coLoc && "Khi khách chốt đơn có lắp đặt, bấm “Mở dự án” để chia hạng mục và theo tiến độ."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Dự án</th>
                  <th>Khách hàng</th>
                  <th>Trạng thái</th>
                  <th>Tiến độ</th>
                  <th className="an-tren-dt">Hạn dự kiến</th>
                  <th>Phụ trách</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/du-an/${d.id}`}>{d.ten}</Link>
                      <div className="dong-phu">
                        {d.ma}
                        {d.donHang && ` · từ ${d.donHang.so}`}
                      </div>
                    </td>
                    <td>
                      <Link href={`/crm/khach-hang/${d.khachHang.id}`}>{d.khachHang.ten}</Link>
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_DU_AN[d.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_DU_AN[d.trangThai] ?? d.trangThai}</span>
                    </td>
                    <td className="nho">
                      {d.tienDo.phanTram}%
                      <div className="dong-phu">
                        {d.tienDo.xong}/{d.tienDo.tong} hạng mục
                      </div>
                    </td>
                    <td className="an-tren-dt so nho">
                      {d.ngayDuKien ? dinhDangNgay(d.ngayDuKien) : "—"}
                      {d.quaHan && <div className="dong-phu chu-loi">quá hạn</div>}
                    </td>
                    <td>{d.nguoiPhuTrach.hoTen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang
          tong={kq.tong}
          trang={kq.trang}
          coTrang={kq.coTrang}
          duongDan="/du-an"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-chay", nguoiPhuTrach: boLoc.nguoiPhuTrach, quaHan: boLoc.quaHan }}
        />
      </section>
    </>
  );
}
