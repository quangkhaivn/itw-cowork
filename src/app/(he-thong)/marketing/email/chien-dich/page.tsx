import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocChienDich } from "@/modules/email/luoc-do";
import { danhSachChienDich } from "@/modules/email/service";
import { LOP_TRANG_THAI_CHIEN_DICH, NHAN_TRANG_THAI_CHIEN_DICH, TRANG_THAI_CHIEN_DICH } from "@/modules/email/tinh-toan";

export const dynamic = "force-dynamic";

export default async function TrangChienDichEmail({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("marketing.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const loc = LuocDoLocChienDich.parse({
    q: layMot(sp.q),
    trangThai: (TRANG_THAI_CHIEN_DICH as readonly string[]).includes(tt) ? tt : "",
    trang: layMot(sp.trang) || 1,
  });
  const kq = await docDuLieu(nd, (tx) => danhSachChienDich(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), loc));
  const coLoc = Boolean(loc.q || loc.trangThai);
  return (
    <>
      <DauTrang
        tieuDe="Đợt gửi email"
        duongDan={[{ nhan: "Marketing" }]}
        moTa="Chọn mẫu và người nhận → gửi duyệt → người có quyền duyệt đưa vào hàng gửi. Máy gửi dần theo tốc độ đặt ở Cấu hình, người đã từ chối nhận tin luôn bị loại."
        hanhDong={
          coQuyen(nd.hoSo, "marketing.create") ? (
            <Link className="nut chinh" href="/marketing/email/chien-dich/moi">
              Lập đợt gửi email
            </Link>
          ) : null
        }
      />
      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={loc.q} placeholder="Mã, tên chiến dịch" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={loc.trangThai}>
              <option value="">Tất cả</option>
              {TRANG_THAI_CHIEN_DICH.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_CHIEN_DICH[t]}
                </option>
              ))}
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/marketing/email/chien-dich">
              Xóa lọc
            </Link>
          )}
        </form>
        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có chiến dịch nào khớp" : "Chưa có đợt gửi email nào"}>
            {!coLoc && "Soạn một mẫu email trước, rồi lập chiến dịch từ mẫu đó."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Chiến dịch</th>
                  <th>Trạng thái</th>
                  <th className="so">Đã gửi / tổng</th>
                  <th className="so an-tren-dt">Mở</th>
                  <th className="so an-tren-dt">Bấm</th>
                  <th className="so an-tren-dt">Huỷ nhận</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((c) => (
                  <tr key={c.id} className={c.trangThai === "CANCELLED" ? "mo" : undefined}>
                    <td>
                      <Link href={`/marketing/email/chien-dich/${c.id}`}>
                        <strong>{c.ma}</strong> · {c.ten}
                      </Link>
                      <div className="dong-phu">Lập {dinhDangNgay(c.lapLuc)}{c.duyetLuc ? ` · duyệt ${dinhDangNgay(c.duyetLuc)}` : ""}</div>
                    </td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI_CHIEN_DICH[c.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_CHIEN_DICH[c.trangThai] ?? c.trangThai}</span>
                      {c.trangThai === "PAUSED" && c.lyDoDung && <div className="dong-phu chu-loi">{c.lyDoDung}</div>}
                    </td>
                    <td className="so">
                      {c.thongKe ? `${dinhDangSo(c.thongKe.daGui)} / ${dinhDangSo(c.thongKe.tong - c.thongKe.biLoai)}` : "—"}
                      {c.thongKe?.loi ? <div className="dong-phu chu-loi">{c.thongKe.loi} lỗi</div> : null}
                    </td>
                    <td className="so an-tren-dt">{c.thongKe ? dinhDangSo(c.thongKe.mo) : "—"}</td>
                    <td className="so an-tren-dt">{c.thongKe ? dinhDangSo(c.thongKe.bam) : "—"}</td>
                    <td className="so an-tren-dt">{c.thongKe ? dinhDangSo(c.thongKe.huyNhanTin) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang tong={kq.tong} trang={kq.trang} coTrang={kq.coTrang} duongDan="/marketing/email/chien-dich" thamSo={{ q: loc.q, trangThai: loc.trangThai }} />
      </section>
    </>
  );
}
