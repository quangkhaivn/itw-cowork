import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import KhungDinhKem from "@/components/dinh-kem/KhungDinhKem";
import FormNhanh from "@/components/nhan-su/FormNhanh";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietHoSoNhanSu, danhSachDiaDiem } from "@/modules/nhan-su/service";
import { soDuPhepCua } from "@/modules/nghi-phep/service";
import { LOAI_HOP_DONG, LOAI_NHAN_SU, NHAN_LOAI_HOP_DONG, NHAN_LOAI_NHAN_SU } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

const TT_HD: Record<string, string> = { "hieu-luc": "Hiệu lực", "het-hieu-luc": "Hết hiệu lực", huy: "Hủy" };

export default async function TrangChiTietHoSo({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("nhan_su.view");
  const { id } = await params;
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const hs = await chiTietHoSoNhanSu(nc, id);
    return {
      hs,
      diaDiem: await danhSachDiaDiem(nc, true),
      soDu: coQuyen(nd.hoSo, "cham_cong.view") ? await soDuPhepCua(nc, id).catch(() => null) : null,
      nguoi: await tx.user.findMany({ where: { status: "hoat-dong", isSystem: false, NOT: { id } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    };
  });
  const { hs } = d;
  const sua = coQuyen(nd.hoSo, "nhan_su.update");
  const tao = coQuyen(nd.hoSo, "nhan_su.create");
  const luaLoaiHd = LOAI_HOP_DONG.map((l) => ({ giaTri: l, nhan: NHAN_LOAI_HOP_DONG[l] }));
  const nam = new Date().getFullYear();

  return (
    <>
      <DauTrang
        tieuDe={hs.hoTen}
        duongDan={[{ nhan: "Nhân sự" }, { nhan: "Hồ sơ nhân sự", href: "/nhan-su/ho-so" }]}
        moTa={`${hs.email}${hs.chucDanh ? ` · ${hs.chucDanh}` : ""}${hs.phongBan ? ` · ${hs.phongBan}` : ""}${hs.quanLy ? ` · quản lý: ${hs.quanLy.hoTen}` : ""}`}
        hanhDong={sua && (
          <FormNhanh nhanNut="Sửa hồ sơ nhân sự" tieuDe="Hồ sơ nhân sự" url={`/api/v1/nhan-su/ho-so/${hs.id}`} phuongThuc="PUT" lopNut="nut chinh"
            truong={[
              { ten: "loaiNhanSu", nhan: "Loại nhân sự", kieu: "select", luaChon: LOAI_NHAN_SU.map((l) => ({ giaTri: l, nhan: NHAN_LOAI_NHAN_SU[l] })) },
              { ten: "maChamCong", nhan: "Mã chấm công (PIN trên máy)", kieu: "text", goiY: "Đúng số \"Mã người dùng / User ID\" khai trên máy vân tay." },
              { ten: "diaDiemMacDinhId", nhan: "Địa điểm làm việc mặc định", kieu: "select", luaChon: [{ giaTri: "", nhan: "— Chưa chọn —" }, ...d.diaDiem.map((x) => ({ giaTri: x.id, nhan: x.ten }))] },
              { ten: "ngayVaoLam", nhan: "Ngày vào làm", kieu: "date", goiY: "Dùng tính thâm niên và quỹ phép năm." },
            ]}
            giaTriDau={{ loaiNhanSu: hs.loaiNhanSu, maChamCong: hs.maChamCong ?? "", diaDiemMacDinhId: hs.diaDiemMacDinhId ?? "", ngayVaoLam: hs.ngayVaoLam ?? "" }} />
        )}
      />

      <div className="luoi-chi-so">
        <div className="the chi-so"><div className="nhan">Loại nhân sự</div><div className="gia-tri" style={{ fontSize: 18 }}>{NHAN_LOAI_NHAN_SU[hs.loaiNhanSu as keyof typeof NHAN_LOAI_NHAN_SU] ?? hs.loaiNhanSu}</div></div>
        <div className="the chi-so"><div className="nhan">Mã chấm công</div><div className="gia-tri" style={{ fontSize: 18 }}>{hs.maChamCong ?? "Chưa có"}</div></div>
        <div className="the chi-so"><div className="nhan">Ngày vào làm</div><div className="gia-tri" style={{ fontSize: 18 }}>{hs.ngayVaoLam ? dinhDangNgay(hs.ngayVaoLam) : "—"}</div></div>
        {d.soDu && (
          <div className="the chi-so">
            <div className="nhan">Phép năm {d.soDu.nam} còn được dùng</div>
            <div className="gia-tri">{d.soDu.duocDung}</div>
            <div className="ghi-chu">Quỹ {d.soDu.quyNam} · đã dùng {d.soDu.daDung} · chờ {d.soDu.dangCho}{d.soDu.dieuChinh ? ` · điều chỉnh ${d.soDu.dieuChinh}` : ""}</div>
            {sua && (
              <FormNhanh nhanNut="Điều chỉnh quỹ phép" tieuDe="Điều chỉnh quỹ phép (chỉ ghi thêm)" url="/api/v1/nhan-su/dieu-chinh-phep" lopNut="nut nho" themVaoThan={{ nguoiId: hs.id }}
                truong={[
                  { ten: "nam", nhan: "Năm", kieu: "number" },
                  { ten: "soNgay", nhan: "Số ngày (+ cộng, − trừ; bước 0,5)", kieu: "number" },
                  { ten: "lyDo", nhan: "Lý do", kieu: "textarea", batBuoc: true },
                ]}
                giaTriDau={{ nam, soNgay: "", lyDo: "" }} />
            )}
          </div>
        )}
      </div>

      {(hs.loaiNhanSu === "thuc-tap" || hs.thucTap) && (
        <section className="the">
          <div className="dau">
            <h2>Thông tin thực tập</h2>
            {sua && hs.loaiNhanSu === "thuc-tap" && (
              <FormNhanh nhanNut="Sửa" tieuDe="Thông tin thực tập" url={`/api/v1/nhan-su/ho-so/${hs.id}`} phuongThuc="PUT" lopNut="nut nho" bocTrong="thucTap"
                truong={[
                  { ten: "truong", nhan: "Trường", kieu: "text" },
                  { ten: "khoa", nhan: "Khoa", kieu: "text" },
                  { ten: "mssv", nhan: "Mã số sinh viên", kieu: "text" },
                  { ten: "giangVienHuongDan", nhan: "Giảng viên hướng dẫn", kieu: "text" },
                  { ten: "nguoiHuongDanId", nhan: "Người hướng dẫn tại công ty", kieu: "select", luaChon: [{ giaTri: "", nhan: "— Chưa chọn —" }, ...d.nguoi.map((n) => ({ giaTri: n.id, nhan: n.fullName }))] },
                  { ten: "tuNgay", nhan: "Thực tập từ ngày", kieu: "date" },
                  { ten: "denNgay", nhan: "Đến ngày", kieu: "date" },
                  { ten: "ghiChu", nhan: "Ghi chú", kieu: "textarea" },
                ]}
                giaTriDau={{
                  truong: hs.thucTap?.truong ?? "", khoa: hs.thucTap?.khoa ?? "", mssv: hs.thucTap?.mssv ?? "", giangVienHuongDan: hs.thucTap?.giangVienHuongDan ?? "",
                  nguoiHuongDanId: hs.thucTap?.nguoiHuongDan?.id ?? "", tuNgay: hs.thucTap?.tuNgay ?? "", denNgay: hs.thucTap?.denNgay ?? "", ghiChu: hs.thucTap?.ghiChu ?? "",
                }} />
            )}
          </div>
          {hs.thucTap ? (
            <table className="bang-thong-so"><tbody>
              <tr><th>Trường / khoa</th><td>{[hs.thucTap.truong, hs.thucTap.khoa].filter(Boolean).join(" — ") || "—"}</td></tr>
              <tr><th>MSSV</th><td>{hs.thucTap.mssv ?? "—"}</td></tr>
              <tr><th>Giảng viên hướng dẫn</th><td>{hs.thucTap.giangVienHuongDan ?? "—"}</td></tr>
              <tr><th>Người hướng dẫn tại công ty</th><td>{hs.thucTap.nguoiHuongDan?.hoTen ?? "—"}</td></tr>
              <tr><th>Thời gian thực tập</th><td>{hs.thucTap.tuNgay ? dinhDangNgay(hs.thucTap.tuNgay) : "?"} → {hs.thucTap.denNgay ? dinhDangNgay(hs.thucTap.denNgay) : "?"}</td></tr>
              {hs.thucTap.ghiChu && <tr><th>Ghi chú</th><td>{hs.thucTap.ghiChu}</td></tr>}
            </tbody></table>
          ) : <p className="phu">Chưa nhập. Phiếu đánh giá thực tập làm ở giai đoạn 2.</p>}
        </section>
      )}

      <section className="the">
        <div className="dau">
          <h2>Hợp đồng lao động</h2>
          {tao && (
            <FormNhanh nhanNut="Thêm hợp đồng" tieuDe="Thêm hợp đồng lao động" url="/api/v1/nhan-su/hop-dong" lopNut="nut chinh nho" themVaoThan={{ nguoiId: hs.id }}
              truong={[
                { ten: "loai", nhan: "Loại hợp đồng", kieu: "select", luaChon: luaLoaiHd, caDong: true },
                { ten: "tuNgay", nhan: "Từ ngày", kieu: "date", batBuoc: true },
                { ten: "denNgay", nhan: "Đến ngày", kieu: "date", goiY: "Trống với hợp đồng không xác định thời hạn." },
                { ten: "ghiChu", nhan: "Ghi chú", kieu: "textarea" },
              ]}
              giaTriDau={{ loai: hs.loaiNhanSu === "thuc-tap" ? "thuc-tap" : "xac-dinh-thoi-han", tuNgay: "", denNgay: "", ghiChu: "" }} />
          )}
        </div>
        {hs.hopDong.length === 0 ? <TrongRong tieuDe="Chưa có hợp đồng nào" /> : hs.hopDong.map((h) => (
          <div key={h.id} className="the" style={{ marginBottom: 12 }}>
            <div className="dau">
              <h3 style={{ margin: 0 }}>{NHAN_LOAI_HOP_DONG[h.loai as keyof typeof NHAN_LOAI_HOP_DONG] ?? h.loai} · {dinhDangNgay(h.tuNgay)} → {h.denNgay ? dinhDangNgay(h.denNgay) : "không thời hạn"}</h3>
              <span>
                <span className={`huy-hieu ${h.trangThai === "hieu-luc" ? "tot" : ""}`}>{TT_HD[h.trangThai] ?? h.trangThai}</span>{" "}
                {sua && (
                  <FormNhanh nhanNut="Sửa" tieuDe="Sửa hợp đồng" url={`/api/v1/nhan-su/hop-dong/${h.id}`} phuongThuc="PUT" lopNut="nut nho"
                    truong={[
                      { ten: "loai", nhan: "Loại hợp đồng", kieu: "select", luaChon: luaLoaiHd, caDong: true },
                      { ten: "tuNgay", nhan: "Từ ngày", kieu: "date" },
                      { ten: "denNgay", nhan: "Đến ngày", kieu: "date" },
                      { ten: "trangThai", nhan: "Trạng thái", kieu: "select", luaChon: Object.entries(TT_HD).map(([giaTri, nhan]) => ({ giaTri, nhan })) },
                      { ten: "ghiChu", nhan: "Ghi chú", kieu: "textarea" },
                    ]}
                    giaTriDau={{ loai: h.loai, tuNgay: h.tuNgay, denNgay: h.denNgay ?? "", trangThai: h.trangThai, ghiChu: h.ghiChu ?? "" }} />
                )}
              </span>
            </div>
            {h.ghiChu && <p className="phu">{h.ghiChu}</p>}
            <KhungDinhKem loai="employment_contract" doiTuongId={h.id} moTa="Bản scan hợp đồng đã ký, phụ lục." />
          </div>
        ))}
      </section>

      <section className="the">
        <div className="dau"><h2>Lịch làm đã gán</h2><Link className="nut nho" href="/nhan-su/thiet-lap">Gán lịch</Link></div>
        {hs.lich.length === 0 ? <p className="phu">Chưa được gán lịch — không tính công, không nhắc chấm công.</p> : (
          <ul className="ds-lan-cham">{hs.lich.map((l) => <li key={l.id}><span>Từ {dinhDangNgay(l.tuNgay)}: <strong>{l.ten}</strong></span><span className="phu">{l.ghiChu ?? ""}</span></li>)}</ul>
        )}
      </section>
    </>
  );
}
