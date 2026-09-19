import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocKiemToan, NHAN_DOI_TUONG, NHAN_HANH_DONG, traCuuKiemToan } from "@/modules/kiem-toan/service";

export const dynamic = "force-dynamic";

const LOP_HANH_DONG: Record<string, string> = {
  "tu-choi-quyen": "canh-bao",
  "dang-nhap-that-bai": "canh-bao",
  "khoa-dang-nhap": "loi",
  "doi-quyen": "chinh",
  "dat-lai-mat-khau": "chinh",
};

function Json({ gt }: { gt: unknown }) {
  if (gt === null || gt === undefined) return <span className="mo">—</span>;
  return <pre className="json">{JSON.stringify(gt, null, 2)}</pre>;
}

export default async function TrangNhatKyKiemToan({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("audit_log.view");
  const sp = await searchParams;
  const kt = LuocDoLocKiemToan.safeParse({
    hanhDong: layMot(sp.hanhDong),
    doiTuong: layMot(sp.doiTuong),
    nguoi: layMot(sp.nguoi),
    doiTuongId: layMot(sp.doiTuongId),
    tuNgay: layMot(sp.tuNgay),
    denNgay: layMot(sp.denNgay),
    trang: layMot(sp.trang) || 1,
  });
  const boLoc = kt.success ? kt.data : LuocDoLocKiemToan.parse({});
  const kq = await docDuLieu(nd, (tx) => traCuuKiemToan(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), boLoc));
  const coLoc = Boolean(boLoc.hanhDong || boLoc.doiTuong || boLoc.nguoi || boLoc.doiTuongId || boLoc.tuNgay || boLoc.denNgay);

  return (
    <>
      <DauTrang
        tieuDe="Nhật ký kiểm toán"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Ai đã làm gì, lúc nào, từ giá trị nào sang giá trị nào. Chỉ ghi thêm — cơ sở dữ liệu chặn mọi lệnh sửa hoặc xóa trên bảng này. Mật khẩu và khóa bí mật không bao giờ được ghi."
      />
      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong">
            <label htmlFor="hanhDong">Hành động</label>
            <select id="hanhDong" name="hanhDong" defaultValue={boLoc.hanhDong}>
              <option value="">Tất cả</option>
              {Object.entries(NHAN_HANH_DONG).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="doiTuong">Đối tượng</label>
            <select id="doiTuong" name="doiTuong" defaultValue={boLoc.doiTuong}>
              <option value="">Tất cả</option>
              {Object.entries(NHAN_DOI_TUONG).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="truong rong">
            <label htmlFor="nguoi">Người thực hiện (email)</label>
            <input id="nguoi" name="nguoi" type="search" defaultValue={boLoc.nguoi} />
          </div>
          <div className="truong">
            <label htmlFor="tuNgay">Từ ngày</label>
            <input id="tuNgay" name="tuNgay" type="date" defaultValue={boLoc.tuNgay} />
          </div>
          <div className="truong">
            <label htmlFor="denNgay">Đến ngày</label>
            <input id="denNgay" name="denNgay" type="date" defaultValue={boLoc.denNgay} />
          </div>
          {boLoc.doiTuongId && <input type="hidden" name="doiTuongId" value={boLoc.doiTuongId} />}
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/quan-tri/nhat-ky-kiem-toan">
              Xóa lọc
            </Link>
          )}
        </form>
        {boLoc.doiTuongId && (
          <div className="hop-thong-bao thong-tin" style={{ margin: "12px 16px 0" }}>
            Đang xem lịch sử của một bản ghi cụ thể.
          </div>
        )}

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe="Không có bản ghi nào">{coLoc ? "Thử nới rộng bộ lọc." : null}</TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((d) => (
                  <tr key={d.id}>
                    <td className="so nho" style={{ whiteSpace: "nowrap" }}>
                      {dinhDangNgayGio(d.createdAt)}
                    </td>
                    <td>
                      {d.actorEmail ?? <span className="mo">hệ thống</span>}
                      {d.ipAddress && <div className="dong-phu">IP {d.ipAddress}</div>}
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_HANH_DONG[d.action] ?? ""}`}>{NHAN_HANH_DONG[d.action] ?? d.action}</span>
                      <div className="dong-phu">{NHAN_DOI_TUONG[d.objectType] ?? d.objectType}</div>
                    </td>
                    <td style={{ minWidth: 280 }}>
                      {d.before || d.after ? (
                        <details>
                          <summary>Xem giá trị trước / sau</summary>
                          <div className="luoi-the" style={{ gap: 8, marginTop: 4 }}>
                            <div>
                              <div className="nho mo">Trước</div>
                              <Json gt={d.before} />
                            </div>
                            <div>
                              <div className="nho mo">Sau</div>
                              <Json gt={d.after} />
                            </div>
                          </div>
                        </details>
                      ) : (
                        <span className="mo">—</span>
                      )}
                    </td>
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
          duongDan="/quan-tri/nhat-ky-kiem-toan"
          thamSo={{
            hanhDong: boLoc.hanhDong,
            doiTuong: boLoc.doiTuong,
            nguoi: boLoc.nguoi,
            doiTuongId: boLoc.doiTuongId,
            tuNgay: boLoc.tuNgay,
            denNgay: boLoc.denNgay,
          }}
        />
      </section>
    </>
  );
}
