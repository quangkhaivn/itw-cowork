import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach, dateVeNgay, homNayVN } from "@/modules/crm/chung";
import { GIAI_DOAN_CO_HOI, LOP_GIAI_DOAN, NHAN_GIAI_DOAN, laCoHoiDangMo } from "@/modules/crm/hang-so";
import { LuocDoLocCoHoi } from "@/modules/co-hoi/luoc-do";
import { danhSachCoHoi } from "@/modules/co-hoi/service";

export const dynamic = "force-dynamic";

export default async function TrangCoHoi({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("sales.view");
  const sp = await searchParams;
  const gd = layMot(sp.giaiDoan);
  const boLoc = LuocDoLocCoHoi.parse({
    q: layMot(sp.q),
    // "tat-ca" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng nên không dùng "" trên URL).
    giaiDoan: gd === "tat-ca" ? "" : ["dang-mo", "da-dong", ...GIAI_DOAN_CO_HOI].includes(gd) ? gd : "dang-mo",
    nguoiPhuTrach: /^[0-9a-f-]{36}$/i.test(layMot(sp.nguoiPhuTrach)) ? layMot(sp.nguoiPhuTrach) : "",
    quaHan: layMot(sp.quaHan) === "1" ? "1" : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, nguoi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { kq: await danhSachCoHoi(nc, boLoc), nguoi: await danhSachNguoiPhuTrach(nc, "sales.view") };
  });
  const homNay = homNayVN();
  const coLoc = Boolean(boLoc.q || boLoc.giaiDoan !== "dang-mo" || boLoc.nguoiPhuTrach || boLoc.quaHan);

  return (
    <>
      <DauTrang
        tieuDe="Cơ hội"
        duongDan={[{ nhan: "Bán hàng" }]}
        moTa="Mọi cơ hội đang mở đều có hành động kế tiếp và ngày thực hiện. Xếp theo ngày hành động — việc gấp lên đầu."
        hanhDong={
          <>
            <Link className="nut" href="/ban-hang/pipeline">
              Xem dạng Kanban
            </Link>
            {coQuyen(nd.hoSo, "sales.create") && (
              <Link className="nut chinh" href="/ban-hang/co-hoi/moi">
                <BieuTuong ten="them" co={16} /> Tạo cơ hội
              </Link>
            )}
          </>
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Cơ hội đang mở (theo bộ lọc)</div>
          <div className="gia-tri">{dinhDangSo(kq.pipeline.soLuong)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Giá trị pipeline</div>
          <div className="gia-tri">{dinhDangTien(kq.pipeline.tong)}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Pipeline có trọng số</div>
          <div className="gia-tri">{dinhDangTien(kq.pipeline.coTrongSo)}</div>
          <div className="ghi-chu">Σ giá trị × xác suất</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Tiêu đề, mã CH, tên khách hàng" />
          </div>
          <div className="truong">
            <label htmlFor="giaiDoan">Giai đoạn</label>
            <select id="giaiDoan" name="giaiDoan" defaultValue={boLoc.giaiDoan || "tat-ca"}>
              <option value="dang-mo">Đang mở</option>
              <option value="da-dong">Đã đóng</option>
              <option value="tat-ca">Tất cả</option>
              {GIAI_DOAN_CO_HOI.map((g) => (
                <option key={g} value={g}>
                  {NHAN_GIAI_DOAN[g]}
                </option>
              ))}
            </select>
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiPhuTrach">Người phụ trách</label>
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
            <Link className="nut trong" href="/ban-hang/co-hoi">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có cơ hội khớp bộ lọc" : "Chưa có cơ hội đang mở"}>
            {!coLoc && "Tạo cơ hội từ trang khách hàng, hoặc chuyển đổi một lead đủ điều kiện."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Cơ hội</th>
                  <th>Giai đoạn</th>
                  <th className="so">Giá trị</th>
                  <th>Hành động kế tiếp</th>
                  <th className="an-tren-dt">Dự kiến chốt</th>
                  <th>Phụ trách</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((c) => {
                  const qh = laCoHoiDangMo(c.giaiDoan) && c.ngayHanhDong && dateVeNgay(c.ngayHanhDong) < homNay;
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/ban-hang/co-hoi/${c.id}`}>{c.tieuDe}</Link>
                        <div className="dong-phu">
                          {c.ma} · <Link href={`/crm/khach-hang/${c.khachHang.id}`}>{c.khachHang.ten}</Link>
                        </div>
                      </td>
                      <td>
                        <span className={`huy-hieu ${LOP_GIAI_DOAN[c.giaiDoan] ?? ""}`}>{NHAN_GIAI_DOAN[c.giaiDoan]}</span>
                        <div className="dong-phu">{c.xacSuat}%</div>
                      </td>
                      <td className="so">{dinhDangTien(c.giaTri)}</td>
                      <td>
                        {c.hanhDongKeTiep ?? <span className="mo">—</span>}
                        {c.ngayHanhDong && (
                          <div className="dong-phu">
                            {dinhDangNgay(c.ngayHanhDong)} {qh && <span className="huy-hieu loi">Quá hạn</span>}
                          </div>
                        )}
                      </td>
                      <td className="an-tren-dt so nho">{c.ngayDuKienChot ? dinhDangNgay(c.ngayDuKienChot) : "—"}</td>
                      <td>{c.nguoiPhuTrach.hoTen}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang
          tong={kq.tong}
          trang={kq.trang}
          coTrang={kq.coTrang}
          duongDan="/ban-hang/co-hoi"
          thamSo={{ q: boLoc.q, giaiDoan: boLoc.giaiDoan || "tat-ca", nguoiPhuTrach: boLoc.nguoiPhuTrach, quaHan: boLoc.quaHan }}
        />
      </section>
    </>
  );
}
