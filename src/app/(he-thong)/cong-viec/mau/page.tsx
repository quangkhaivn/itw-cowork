import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachNguoiPhuTrach, homNayVN } from "@/modules/crm/chung";
import { NHAN_UU_TIEN } from "@/modules/crm/hang-so";
import { danhSachLapViec, danhSachMauViec } from "@/modules/cong-viec/mau-lap";
import { NHAN_DO_KHO, NHAN_LOAI_CAP_DUYET, NHAN_TAN_SUAT, NHAN_THU, type TanSuat } from "@/modules/danh-gia/tinh-toan";
import { FormLapViec, FormMauViec } from "./FormMauLap";

export const dynamic = "force-dynamic";

/** Mẫu việc (DG-06) và việc định kỳ (DG-07). */
export default async function TrangMauLap() {
  const nd = await yeuCauQuyen("task.view");
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const tao = coQuyen(nd.hoSo, "task.create");
    return {
      mau: await danhSachMauViec(nc, true),
      lap: await danhSachLapViec(nc),
      nguoiGiao: tao ? (await danhSachNguoiPhuTrach(nc, "task.create")).map((n) => ({ id: n.id, hoTen: n.fullName })) : [],
      nguoiDuyet: tao ? (await tx.user.findMany({ where: { status: "hoat-dong", isSystem: false }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } })).map((n) => ({ id: n.id, hoTen: n.fullName })) : [],
    };
  });
  const tao = coQuyen(nd.hoSo, "task.create");
  const tenNguoi = new Map(d.nguoiDuyet.map((n) => [n.id, n.hoTen]));
  const moTaChuoi = (c: { loai: string; nguoiId?: string | null }[]) =>
    c.length ? c.map((x, i) => `${i + 1}. ${x.loai === "nguoi-cu-the" ? (tenNguoi.get(x.nguoiId ?? "") ?? "Một người") : NHAN_LOAI_CAP_DUYET[x.loai]}`).join(" → ") : "Người giao";
  return (
    <>
      <DauTrang tieuDe="Mẫu việc và việc định kỳ" duongDan={[{ nhan: "Công việc", href: "/cong-viec" }]} moTa="Mẫu điền sẵn độ khó, danh sách kiểm tra, chuỗi duyệt. Việc định kỳ được máy tự sinh mỗi ngày lặp (nhân danh người lập lịch), không sinh trùng." />
      <section className="the">
        <div className="dau"><h2>Mẫu việc</h2>{tao && <FormMauViec nguoi={d.nguoiDuyet} nhanNut="Thêm mẫu" />}</div>
        {d.mau.length === 0 ? <TrongRong tieuDe="Chưa có mẫu việc" /> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Tên</th><th>Tiêu đề</th><th>Độ khó</th><th>Ưu tiên</th><th>Duyệt</th><th>Hạn</th><th>Kiểm tra</th><th>Trạng thái</th>{tao && <th />}</tr></thead>
            <tbody>{d.mau.map((m) => (
              <tr key={m.id}>
                <td>{m.ten}</td><td>{m.tieuDe}</td><td>{m.doKho} — {NHAN_DO_KHO[m.doKho]}</td><td>{NHAN_UU_TIEN[m.uuTien]}</td>
                <td>{m.canDuyet ? moTaChuoi(m.chuoiDuyet) : "Không"}</td><td>{m.soNgayHan !== null ? `${m.soNgayHan} ngày` : "—"}</td>
                <td>{m.mucKiemTra.length} mục</td><td>{m.trangThai === "hoat-dong" ? "Đang dùng" : "Ngừng"}</td>
                {tao && <td>{(m.nguoiTaoId === nd.hoSo.userId || coQuyen(nd.hoSo, "nhan_su.update")) && <FormMauViec mau={m} nguoi={d.nguoiDuyet} nhanNut="Sửa" lopNut="nut nho" />}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <section className="the">
        <div className="dau"><h2>Việc định kỳ</h2>{tao && <FormLapViec nguoiGiao={d.nguoiGiao} nguoiDuyet={d.nguoiDuyet} mau={d.mau.filter((m) => m.trangThai === "hoat-dong")} homNay={homNayVN()} nhanNut="Thêm việc định kỳ" />}</div>
        {d.lap.length === 0 ? <TrongRong tieuDe="Chưa có việc định kỳ">Ví dụ: “Kiểm tồn kho sáng thứ Hai” lặp hằng tuần vào T2, hạn 10:00.</TrongRong> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Tên</th><th>Việc</th><th>Lặp</th><th>Hạn</th><th>Giao cho</th><th>Người lập</th><th>Lần sinh cuối</th><th>Trạng thái</th>{tao && <th />}</tr></thead>
            <tbody>{d.lap.map((l) => (
              <tr key={l.id}>
                <td>{l.ten}</td><td>{l.tieuDe}{l.canDuyet ? <span className="huy-hieu"> cần duyệt</span> : null}</td>
                <td>{NHAN_TAN_SUAT[l.tanSuat as TanSuat]}{l.tanSuat === "tuan" ? `: ${l.thu.map((t) => NHAN_THU[t]).join(", ")}` : l.tanSuat === "thang" ? `: ngày ${l.ngayThang}` : ""}</td>
                <td>{l.gioHan}</td><td>{l.nguoi.map((n) => n.hoTen).join(", ")}</td><td>{l.nguoiLap.hoTen}</td>
                <td>{l.lanCuoi ? l.lanCuoi.split("-").reverse().join("/") : "—"}</td><td>
                  {l.trangThai !== "hoat-dong" ? "Dừng" : l.chuoiSai ? (
                    // QĐ-154: lịch lập trước luật người duyệt — worker không sinh việc cho tới khi sửa chuỗi duyệt.
                    <span className="huy-hieu loi" title={l.chuoiSai.lyDo}>Ngừng sinh — chuỗi duyệt không hợp lệ</span>
                  ) : "Đang chạy"}
                </td>
                {tao && <td>{l.nguoiLap.id === nd.hoSo.userId && <FormLapViec lap={l} nguoiGiao={d.nguoiGiao} nguoiDuyet={d.nguoiDuyet} mau={d.mau} homNay={homNayVN()} nhanNut={l.chuoiSai ? "Sửa chuỗi duyệt" : "Sửa"} lopNut={l.chuoiSai ? "nut chinh nho" : "nut nho"} />}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
