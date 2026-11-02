import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauMotTrongCacQuyen } from "@/lib/trang";
import { dinhDangSo } from "@/lib/dinh-dang";
import { danhSachBoKpi } from "@/modules/danh-gia/service";
import { CHI_SO, MA_CHI_SO } from "@/modules/danh-gia/tinh-toan";
import FormBoKpi from "./FormBoKpi";

export const dynamic = "force-dynamic";

/** Bộ KPI theo vị trí (DG-50 → DG-53). Nhân sự quản lý (`nhan_su.update`). */
export default async function TrangBoKpi() {
  const nd = await yeuCauMotTrongCacQuyen(["danh_gia.view", "nhan_su.view"]);
  const d = await docDuLieu(nd, async (tx) => ({
    bo: await danhSachBoKpi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)),
    vaiTro: (await tx.role.findMany({ where: { status: "hoat-dong", code: { not: "ai-assistant" } }, select: { code: true, name: true }, orderBy: { name: "asc" } })).map((r) => ({ ma: r.code, ten: r.name })),
  }));
  const sua = coQuyen(nd.hoSo, "nhan_su.update");
  const chiSo = MA_CHI_SO.map((m) => ({ ma: m, ten: CHI_SO[m].ten, donVi: CHI_SO[m].donVi }));
  const tenVaiTro = new Map(d.vaiTro.map((v) => [v.ma, v.ten]));
  return (
    <>
      <DauTrang
        tieuDe="Bộ KPI theo vị trí"
        duongDan={[{ nhan: "Đánh giá nhân viên", href: "/danh-gia" }]}
        moTa="Mỗi bộ 3–6 chỉ tiêu, trọng số cộng lại 100. Chỉ tiêu tự tính lấy số liệu Cowork (doanh số đã thu, lead, công nợ quá hạn, phiếu hỗ trợ, điểm việc…); chỉ tiêu định tính do quản lý chấm 0–100. Sửa bộ KPI không đổi phiếu đã mở."
        hanhDong={sua && <FormBoKpi chiSo={chiSo} vaiTro={d.vaiTro} nhanNut="Thêm bộ KPI" />}
      />
      {d.bo.length === 0 ? <section className="the"><TrongRong tieuDe="Chưa có bộ KPI">Chưa có bộ nào thì phiếu đánh giá chỉ có một mục “Đánh giá chung của quản lý”.</TrongRong></section> : d.bo.map((b) => (
        <section className="the" key={b.id}>
          <div className="dau">
            <h2>{b.ten} <span className="phu nho">({b.ma}{b.chucDanh ? ` · chức danh “${b.chucDanh}”` : ""}{b.maVaiTro ? ` · vai trò ${tenVaiTro.get(b.maVaiTro) ?? b.maVaiTro}` : ""}{!b.chucDanh && !b.maVaiTro ? " · bộ mặc định" : ""}{b.trangThai !== "hoat-dong" ? " · ngừng" : ""})</span></h2>
            {sua && <FormBoKpi bo={b} chiSo={chiSo} vaiTro={d.vaiTro} nhanNut="Sửa" lopNut="nut nho" />}
          </div>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Chỉ tiêu</th><th className="so">Trọng số</th><th>Nguồn</th><th className="so">Mục tiêu tháng</th><th className="so">Mục tiêu quý</th></tr></thead>
            <tbody>{b.chiTieu.map((c) => (
              <tr key={c.id}>
                <td>{c.ten}</td><td className="so">{c.trongSo}</td>
                <td>{c.nguon === "tu-dong" && c.chiSo ? `${CHI_SO[c.chiSo].ten} (${c.chieu === "thap-tot" ? "thấp là tốt" : "cao là tốt"})` : "Quản lý chấm"}</td>
                <td className="so">{c.mucTieuThang !== null ? dinhDangSo(c.mucTieuThang) : "—"}</td><td className="so">{c.mucTieuQuy !== null ? dinhDangSo(c.mucTieuQuy) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      ))}
    </>
  );
}
