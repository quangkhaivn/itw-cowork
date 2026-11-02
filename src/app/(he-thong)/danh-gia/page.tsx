import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { homNayVN } from "@/modules/crm/chung";
import { docCauHinhDanhGia } from "@/modules/danh-gia/chung";
import { danhSachKy, phieuCuaToi } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

const NHAN_BUOC: Record<string, string> = { "nhan-vien": "Chờ tự đánh giá", "quan-ly": "Chờ quản lý chấm", "cho-chot": "Chờ chốt", "da-chot": "Đã chốt" };

/** Đánh giá định kỳ (DG-60 → DG-68): kỳ đánh giá, phiếu của tôi. Nhân sự mở kỳ. */
export default async function TrangDanhGia() {
  const nd = await yeuCauQuyen("danh_gia.view");
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { ky: await danhSachKy(nc), cuaToi: await phieuCuaToi(nc), ch: await docCauHinhDanhGia(tx) };
  });
  const quanLyNs = coQuyen(nd.hoSo, "nhan_su.update");
  const hn = homNayVN();
  return (
    <>
      <DauTrang
        tieuDe="Đánh giá nhân viên"
        moTa={<>Mỗi kỳ: máy điền sẵn chỉ tiêu tự tính → nhân viên tự đánh giá → quản lý trực tiếp chấm chỉ tiêu định tính → trưởng phòng / giám đốc chốt. Điểm tổng quy ra xếp loại A/B/C/D và hệ số thưởng (A ≥ {d.ch.nguongA}, B ≥ {d.ch.nguongB}, C ≥ {d.ch.nguongC} — đổi ở Cấu hình). Đã chốt thì không sửa; sai thì điều chỉnh có lý do.</>}
        hanhDong={
          <span style={{ display: "flex", gap: 6 }}>
            <Link className="nut" href="/danh-gia/kpi">Bộ KPI</Link>
            {quanLyNs && (
              <FormNhanh nhanNut="Mở kỳ đánh giá" tieuDe="Mở kỳ đánh giá" url="/api/v1/danh-gia/ky" lopNut="nut chinh"
                truong={[
                  { ten: "loai", nhan: "Loại kỳ", kieu: "select", luaChon: [{ giaTri: "thang", nhan: "Tháng" }, { giaTri: "quy", nhan: "Quý" }] },
                  { ten: "nam", nhan: "Năm", kieu: "number", batBuoc: true },
                  { ten: "so", nhan: "Tháng (1–12) / Quý (1–4)", kieu: "number", batBuoc: true, goiY: "Máy tạo phiếu cho mọi người có quản lý trực tiếp (không gồm thực tập sinh), chọn bộ KPI theo chức danh → vai trò → bộ mặc định." },
                ]}
                giaTriDau={{ loai: d.ch.kyThang === 3 ? "quy" : "thang", nam: Number(hn.slice(0, 4)), so: d.ch.kyThang === 3 ? Math.ceil(Number(hn.slice(5, 7)) / 3) : Number(hn.slice(5, 7)) }} />
            )}
          </span>
        }
      />
      <section className="the">
        <div className="dau"><h2>Phiếu của tôi</h2></div>
        {d.cuaToi.length === 0 ? <TrongRong tieuDe="Chưa có phiếu đánh giá nào" /> : (
          <ul>{d.cuaToi.map((p) => (
            <li key={p.id}><Link href={`/danh-gia/${p.id}`}>{p.ky}</Link> — {NHAN_BUOC[p.trangThai]}{p.ketQua ? ` · ${p.ketQua.tongDiem} điểm, loại ${p.ketQua.xepLoai}` : ""}</li>
          ))}</ul>
        )}
      </section>
      <section className="the">
        <div className="dau"><h2>Kỳ đánh giá</h2></div>
        {d.ky.length === 0 ? <TrongRong tieuDe="Chưa có kỳ đánh giá" /> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Kỳ</th><th>Từ – đến</th><th className="so">Chờ tự đánh giá</th><th className="so">Chờ chấm</th><th className="so">Chờ chốt</th><th className="so">Đã chốt</th></tr></thead>
            <tbody>{d.ky.map((k) => (
              <tr key={k.id}>
                <td><Link href={`/danh-gia/ky/${k.id}`}>{k.nhan}</Link></td>
                <td>{k.tu.split("-").reverse().join("/")} – {k.den.split("-").reverse().join("/")}</td>
                <td className="so">{k.dem["nhan-vien"] ?? 0}</td><td className="so">{k.dem["quan-ly"] ?? 0}</td><td className="so">{k.dem["cho-chot"] ?? 0}</td><td className="so">{k.dem["da-chot"] ?? 0}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
