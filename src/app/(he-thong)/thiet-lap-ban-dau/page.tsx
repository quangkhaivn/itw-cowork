import { headers } from "next/headers";
import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { docDuLieu, yeuCauDangNhap } from "@/lib/trang";
import { layIpKhach } from "@/lib/yeu-cau";
import { viecThietLap } from "@/modules/thiet-lap-ban-dau/service";

export const dynamic = "force-dynamic";

/**
 * Thiết lập ban đầu (0.22.0 — QĐ-180): việc cần bổ sung theo NGƯỜI PHỤ TRÁCH. Không việc nào bắt buộc — phần mềm vẫn
 * chạy, chỗ thiếu có cảnh báo và đường dẫn tới màn hình bổ sung. Mỗi người chỉ thấy phần của mình.
 */
export default async function TrangThietLapBanDau() {
  const nd = await yeuCauDangNhap();
  const ip = layIpKhach(await headers());
  const d = await docDuLieu(nd, (tx) => viecThietLap(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo, ip)));
  return (
    <>
      <DauTrang
        tieuDe="Thiết lập ban đầu"
        moTa="Phần mềm chạy được ngay cả khi chưa đủ dữ liệu. Ai phụ trách phần nào thì bổ sung dần phần đó — mỗi việc dưới đây đều không bắt buộc."
      />
      {d.nhom.length === 0 ? (
        <TrongRong tieuDe="Bạn không phụ trách việc thiết lập nào">Nhân sự, Kế toán, Kỹ thuật và Giám đốc / Quản trị thấy phần việc của mình ở đây.</TrongRong>
      ) : (
        <>
          <div className={`hop-thong-bao ${d.soViecChuaXong ? "thong-tin" : "tot"}`}>
            {d.soViecChuaXong ? `Còn ${d.soViecChuaXong} việc chưa xong trong phần bạn phụ trách.` : "Phần bạn phụ trách đã thiết lập xong."}
          </div>
          {d.nhom.map((n) => (
            <section key={n.ma} className="the">
              <div className="dau"><h2>{n.ten}</h2><span className="phu nho">{n.viec.filter((v) => !v.xong).length ? `còn ${n.viec.filter((v) => !v.xong).length} việc` : "xong"}</span></div>
              <div className="cuon-ngang"><table className="bang">
                <thead><tr><th>Việc</th><th>Trạng thái</th><th>Ghi chú</th><th /></tr></thead>
                <tbody>{n.viec.map((v) => (
                  <tr key={v.ma}>
                    <td>{v.ten}</td>
                    <td><span className={`huy-hieu ${v.xong ? "tot" : "canh-bao"}`}>{v.xong ? "Xong" : `Còn thiếu ${v.conThieu}`}</span></td>
                    <td className="nho">{v.ghiChu}</td>
                    <td><Link className={`nut nho${v.xong ? "" : " chinh"}`} href={v.duongDan}>{v.xong ? "Xem" : "Bổ sung"}</Link></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
