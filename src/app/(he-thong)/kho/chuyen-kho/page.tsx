import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocChuyenKho } from "@/modules/chuyen-kho/luoc-do";
import { danhSachChuyenKho } from "@/modules/chuyen-kho/service";
import { LOP_TRANG_THAI_CHUYEN_KHO, NHAN_TRANG_THAI_CHUYEN_KHO } from "@/modules/chuyen-kho/tinh-toan";
import { danhSachKho } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANG_THAI = ["DRAFT", "IN_TRANSIT", "RECEIVED", "CANCELLED"];

export default async function TrangChuyenKho({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("inventory.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocChuyenKho.parse({
    q: layMot(sp.q),
    // "dang-mo" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "dang-mo" ? "" : tt === "tat-ca" || TRANG_THAI.includes(tt) ? tt : "",
    kho: LA_UUID.test(layMot(sp.kho)) ? layMot(sp.kho) : "",
    trang: layMot(sp.trang) || 1,
  });

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const [kq, kho] = await Promise.all([danhSachChuyenKho(nc, boLoc), danhSachKho(nc, true)]);
    return { kq, kho };
  });

  const { kq } = du;
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.kho);
  const duocLap = coQuyen(nd.hoSo, "inventory.create");

  return (
    <>
      <DauTrang
        tieuDe="Chuyển kho nội bộ"
        duongDan={[{ nhan: "Kho" }]}
        moTa="Điều hàng giữa các kho. Hai bước: xuất khỏi kho nguồn, rồi nhận vào kho đích — giữa hai bước hàng đang trên đường, không thuộc kho nào."
        hanhDong={
          duocLap ? (
            <Link className="nut chinh" href="/kho/chuyen-kho/moi">
              Lập phiếu chuyển
            </Link>
          ) : null
        }
      />

      <div className="luoi-chi-so">
        <div className={`the chi-so ${kq.tomTat.soPhieuDangDi > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Đang trên đường</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.soLuongDangDi)}</div>
          <div className="ghi-chu">
            {kq.tomTat.soPhieuDangDi} phiếu · hàng đã rời kho nguồn mà chưa tới kho đích
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Tổng khớp bộ lọc</div>
          <div className="gia-tri">{dinhDangSo(kq.tong)}</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số phiếu, lý do, tên hàng" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-mo"}>
              <option value="dang-mo">Đang mở</option>
              <option value="DRAFT">Nháp</option>
              <option value="IN_TRANSIT">Đang trên đường</option>
              <option value="RECEIVED">Đã nhận</option>
              <option value="CANCELLED">Đã hủy</option>
              <option value="tat-ca">Tất cả</option>
            </select>
          </div>
          <div className="truong">
            <label htmlFor="kho">Kho</label>
            <select id="kho" name="kho" defaultValue={boLoc.kho}>
              <option value="">Mọi kho</option>
              {du.kho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten}
                </option>
              ))}
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/kho/chuyen-kho">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có phiếu nào khớp bộ lọc" : "Chưa có phiếu chuyển kho nào đang mở"}>
            {!coLoc && "Khi cần điều hàng từ kho này sang kho khác, lập phiếu ở đây."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Phiếu</th>
                  <th>Từ kho → đến kho</th>
                  <th className="an-tren-dt">Hàng</th>
                  <th className="so">Xuất / nhận</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((p) => (
                  <tr key={p.id} className={p.trangThai === "CANCELLED" ? "mo" : undefined}>
                    <td>
                      <Link href={`/kho/chuyen-kho/${p.id}`}>
                        <strong>{p.so}</strong>
                      </Link>
                      <div className="dong-phu">{dinhDangNgay(p.ngayChuyen)}</div>
                    </td>
                    <td className="nho">
                      {p.khoNguon.ten} <span className="phu">→</span> {p.khoDich.ten}
                    </td>
                    <td className="an-tren-dt nho">
                      {p.dong.map((d) => (
                        <div key={d.id}>
                          {d.ten} · {d.soLuong}
                        </div>
                      ))}
                    </td>
                    <td className="so">
                      {p.tongKet.tongXuat} / {p.tongKet.tongNhan}
                      {p.tongKet.coThieu && <div className="dong-phu chu-loi">thiếu {p.tongKet.thieu}</div>}
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_CHUYEN_KHO[p.trangThai] ?? ""}`}>
                        {NHAN_TRANG_THAI_CHUYEN_KHO[p.trangThai] ?? p.trangThai}
                      </span>
                      {p.lyDoHuy && <div className="dong-phu chu-loi">{p.lyDoHuy}</div>}
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
          duongDan="/kho/chuyen-kho"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-mo", kho: boLoc.kho }}
        />
      </section>
    </>
  );
}
