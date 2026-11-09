import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachBangCong } from "@/modules/cham-cong/bang-cong";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import { homNayVN } from "@/modules/crm/chung";
import TacVuBangCong from "./TacVuBangCong";

export const dynamic = "force-dynamic";

/** Bảng công tháng (NS-50 → NS-54): Nhân sự sinh nháp → nhân viên phản hồi → giải quyết → khóa → xuất CSV. */
export default async function TrangBangCong() {
  const nd = await yeuCauQuyen("cham_cong.view");
  const ds = await docDuLieu(nd, (tx) => danhSachBangCong(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));
  const datTay = coQuyen(nd.hoSo, "cham_cong.update");
  const nguoi = datTay
    ? await docDuLieu(nd, (tx) => tx.user.findMany({ where: { status: "hoat-dong", isSystem: false, id: { not: nd.hoSo.userId } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }))
    : [];
  const homNay = homNayVN();
  return (
    <>
      <DauTrang
        tieuDe="Bảng công tháng"
        duongDan={[{ nhan: "Nhân sự" }]}
        moTa="Nhân sự sinh bảng công nháp; mỗi người xem dòng của mình và phản hồi trong hạn; Nhân sự giải quyết rồi khóa. Bảng đã khóa không sửa được — sai sót sau đó vào dòng điều chỉnh của kỳ sau."
        hanhDong={datTay && (
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <TacVuBangCong />
            {/* 0.22.0 (QĐ-174): đặt công từng ngày cho người không có máy / GPS — kỳ chưa khóa, bắt buộc lý do. */}
            <FormNhanh nhanNut="Đặt công tay" tieuDe="Đặt công tay (người không có máy / GPS)" url="/api/v1/cham-cong/cong-tay" lopNut="nut"
              truong={[
                { ten: "nguoiId", nhan: "Nhân viên", kieu: "select", caDong: true, luaChon: nguoi.map((n) => ({ giaTri: n.id, nhan: n.fullName })) },
                { ten: "ngay", nhan: "Ngày", kieu: "date", batBuoc: true },
                { ten: "denNgay", nhan: "Đến ngày (tùy chọn — chỉ ngày phải làm theo lịch)", kieu: "date" },
                { ten: "cong", nhan: "Công", kieu: "select", luaChon: [{ giaTri: "1", nhan: "1 công (cả ngày)" }, { giaTri: "0.5", nhan: "0,5 công (nửa ngày)" }, { giaTri: "0", nhan: "0 công (vắng)" }] },
                { ten: "lyDo", nhan: "Lý do", kieu: "textarea", batBuoc: true, caDong: true, goiY: "Ví dụ: làm việc tại công trình, không có máy chấm công." },
              ]}
              giaTriDau={{ nguoiId: nguoi[0]?.id ?? "", ngay: homNay, denNgay: "", cong: "1", lyDo: "" }} />
          </span>
        )}
      />
      {datTay && <p className="phu nho">Công đặt tay chỉ ghi được khi bảng công tháng đó <strong>chưa khóa</strong>, có lý do và ghi nhật ký kiểm toán. Sau khi đặt, bấm “Sinh lại” bảng công nháp để cập nhật. Không ai tự đặt công cho mình.</p>}
      <section className="the">
        {ds.length === 0 ? (
          <TrongRong tieuDe="Chưa có bảng công nào">Nhân sự bấm &quot;Sinh bảng công&quot; để lập bảng nháp cho một tháng.</TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead><tr><th>Kỳ</th><th>Trạng thái</th><th>Sinh lúc</th><th>Hạn phản hồi</th><th className="so">Phản hồi chưa giải quyết</th><th>Khóa lúc</th></tr></thead>
              <tbody>
                {ds.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/cham-cong/bang-cong/${b.id}`}>Tháng {b.thang}/{b.nam}</Link></td>
                    <td><span className={`huy-hieu ${b.trangThai === "da-khoa" ? "tot" : "canh-bao"}`}>{b.trangThai === "da-khoa" ? "Đã khóa" : "Nháp"}</span></td>
                    <td>{dinhDangNgayGio(b.sinhLuc)}</td>
                    <td>{dinhDangNgayGio(b.hanPhanHoi)}</td>
                    <td className="so">{b.phanHoiMo}</td>
                    <td>{b.khoaLuc ? dinhDangNgayGio(b.khoaLuc) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
