import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import NutGoi from "@/components/luong/NutGoi";
import KenhCuaBai from "@/components/mang-xa-hoi/KenhCuaBai";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachBai, lichBai } from "@/modules/mang-xa-hoi/bai";
import { NHAN_DA_DUYET_CAN_HEN_LAI, NHAN_TRANG_THAI_BAI, TRANG_THAI_BAI, type TrangThaiBai } from "@/modules/mang-xa-hoi/hang-so";

export const dynamic = "force-dynamic";

const DUONG_XUAT_CSV = `/api/v1/mang-xa-hoi/bai/xuat`;

const ngayVN = (d: Date) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit" }).format(d);

/** Danh sách bài + lịch 14 ngày tới (0.23.0). Trạng thái từng kênh lấy từ CSDL — "Đã đăng" chỉ khi đã đọc lại xác minh. */
export default async function TrangBaiMangXaHoi({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("mxh.view");
  const sp = await searchParams;
  const trangThai = layMot(sp.trangThai);
  const trang = Math.max(1, Number(layMot(sp.trang)) || 1);
  const bayGio = new Date();
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      ds: await danhSachBai(nc, { trangThai: (TRANG_THAI_BAI as readonly string[]).includes(trangThai) ? trangThai : undefined, trang }),
      lich: await lichBai(nc, new Date(bayGio.getTime() - 86_400_000), new Date(bayGio.getTime() + 14 * 86_400_000)),
    };
  });
  const capNhat = coQuyen(nd.hoSo, "mxh.update");
  const theoNgay = new Map<string, typeof d.lich>();
  for (const b of d.lich) {
    const k = b.henLuc ? ngayVN(b.henLuc) : "—";
    theoNgay.set(k, [...(theoNgay.get(k) ?? []), b]);
  }
  const loc = (tt: string) => `/mang-xa-hoi${tt ? `?trangThai=${tt}` : ""}`;

  return (
    <>
      <DauTrang
        tieuDe="Bài và lịch đăng"
        duongDan={[{ nhan: "Mạng xã hội" }]}
        moTa="Trạng thái thật của từng kênh: chỉ báo “Đã đăng” khi nền tảng trả mã bài VÀ hệ thống đã đọc lại thấy khớp. Kênh lỗi có hướng dẫn và nút đăng lại."
        hanhDong={<div style={{ display: "flex", gap: 8 }}>
          {coQuyen(nd.hoSo, "mxh.create") && <Link className="nut chinh" href="/mang-xa-hoi/soan">Soạn bài</Link>}
          {coQuyen(nd.hoSo, "mxh.export") && <a className="nut" href={DUONG_XUAT_CSV}>Xuất CSV</a>}
        </div>}
      />

      <section className="the">
        <div className="dau"><h2>Lịch 14 ngày tới</h2></div>
        {d.lich.length === 0 ? <p className="phu" style={{ padding: "0 16px 16px" }}>Chưa có bài hẹn giờ.</p> : (
          <div className="than" style={{ padding: 16, display: "grid", gap: 8 }}>
            {[...theoNgay.entries()].map(([ngay, ds]) => (
              <div key={ngay}>
                <strong>{ngay}</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {ds.map((b) => {
                    const n = ("canHenLai" in b && b.canHenLai ? NHAN_DA_DUYET_CAN_HEN_LAI : null) ?? NHAN_TRANG_THAI_BAI[b.trangThai as TrangThaiBai] ?? { nhan: b.trangThai, lop: "" };
                    return <li key={b.id}>{b.henLuc && new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(b.henLuc)} — <Link href={`/mang-xa-hoi/bai/${b.id}`}>{b.tieuDe}</Link> <span className={`huy-hieu ${n.lop}`}>{n.nhan}</span></li>;
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="the">
        <div className="dau" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2>Bài ({d.ds.tong})</h2>
          <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Lọc theo trạng thái">
            <Link className={`nut nho${!trangThai ? " chinh" : ""}`} href={loc("")}>Tất cả</Link>
            {TRANG_THAI_BAI.map((t) => <Link key={t} className={`nut nho${trangThai === t ? " chinh" : ""}`} href={loc(t)}>{NHAN_TRANG_THAI_BAI[t].nhan}</Link>)}
          </nav>
        </div>
        {d.ds.dong.length === 0 ? <TrongRong tieuDe="Chưa có bài">Bấm “Soạn bài” để viết bài đầu tiên.</TrongRong> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Bài</th><th>Trạng thái</th><th>Hẹn lúc</th><th>Kênh</th><th>Người soạn</th><th /></tr></thead>
            <tbody>{d.ds.dong.map((b) => {
              const n = ("canHenLai" in b && b.canHenLai ? NHAN_DA_DUYET_CAN_HEN_LAI : null) ?? NHAN_TRANG_THAI_BAI[b.trangThai as TrangThaiBai] ?? { nhan: b.trangThai, lop: "" };
              return (
                <tr key={b.id}>
                  <td><Link href={`/mang-xa-hoi/bai/${b.id}`}>{b.tieuDe ?? b.noiDung.slice(0, 80)}</Link>{b.doAiTao && <span className="huy-hieu thong-tin"> AI soạn</span>}</td>
                  <td><span className={`huy-hieu ${n.lop}`}>{n.nhan}</span></td>
                  <td>{b.henLuc ? dinhDangNgayGio(b.henLuc) : "—"}</td>
                  <td><KenhCuaBai kenh={b.kenh} gon /></td>
                  <td>{b.nguoiSoan}</td>
                  <td>{capNhat && (b.trangThai === "FAILED" || b.trangThai === "PARTIALLY_FAILED") && <NutGoi url={`/api/v1/mang-xa-hoi/bai/${b.id}/dang-lai`} nhan="Đăng lại" lopNut="nut nho" />}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {d.ds.soTrang > 1 && (
          <div style={{ display: "flex", gap: 8, padding: 12 }}>
            {trang > 1 && <Link className="nut nho" href={`/mang-xa-hoi?${new URLSearchParams({ ...(trangThai ? { trangThai } : {}), trang: String(trang - 1) })}`}>← Trước</Link>}
            <span className="phu">Trang {trang}/{d.ds.soTrang}</span>
            {trang < d.ds.soTrang && <Link className="nut nho" href={`/mang-xa-hoi?${new URLSearchParams({ ...(trangThai ? { trangThai } : {}), trang: String(trang + 1) })}`}>Sau →</Link>}
          </div>
        )}
      </section>
    </>
  );
}
