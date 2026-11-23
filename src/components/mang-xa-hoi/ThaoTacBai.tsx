"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { gioVietNamSangIso } from "@/modules/mang-xa-hoi/tinh-toan";

export interface QuyenBai {
  sua: boolean; guiDuyet: boolean; rutDuyet: boolean; duyet: boolean; lyDoKhongDuyet: string | null; dang: boolean; huyLich: boolean;
  dangLai: boolean; veNhap: boolean; xoa: boolean;
}

/** Ô datetime-local là giờ Việt Nam (không theo múi giờ của trình duyệt) → ISO có múi giờ. */
const sangIso = gioVietNamSangIso;

/** Các nút thao tác trên một bài — hiện theo quyền máy chủ trả về; máy chủ vẫn kiểm lại mọi thao tác. */
export default function ThaoTacBai({ id, quyen, phaiDuyet }: { id: string; quyen: QuyenBai; phaiDuyet: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [henLuc, datHenLuc] = useState("");
  const [cheDo, datCheDo] = useState<"khong" | "ngay" | "hen-gio">("khong");
  const [ghiChu, datGhiChu] = useState("");

  async function lam(hanhDong: string, than: unknown = {}, xacNhan?: string) {
    if (xacNhan && !window.confirm(xacNhan)) return;
    if (await goi(`/api/v1/mang-xa-hoi/bai/${id}/${hanhDong}`, "POST", than)) router.refresh();
  }
  async function xoa() {
    if (!window.confirm("Xóa bài nháp này?")) return;
    if (await goi(`/api/v1/mang-xa-hoi/bai/${id}`, "DELETE")) router.push("/mang-xa-hoi");
  }

  const co = Object.entries(quyen).some(([k, v]) => k !== "sua" && k !== "lyDoKhongDuyet" && v === true);
  return (
    <section className="the">
      <div className="dau"><h2>Thao tác</h2></div>
      <div className="than" style={{ padding: 16, display: "grid", gap: 12 }}>
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        {!co && !quyen.lyDoKhongDuyet && <p className="phu">Không có thao tác nào bạn làm được ở trạng thái này.</p>}
        {quyen.lyDoKhongDuyet && <div className="hop-thong-bao canh-bao">{quyen.lyDoKhongDuyet}</div>}
        {quyen.dang && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <button type="button" className="nut chinh" disabled={dangGui} onClick={() => lam("dang-ngay", {}, "Đăng bài lên các kênh đã chọn ngay bây giờ?")}>Đăng ngay</button>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="nho">Hẹn giờ (giờ Việt Nam)</span>
              <input type="datetime-local" value={henLuc} onChange={(e) => datHenLuc(e.target.value)} />
            </label>
            <button type="button" className="nut" disabled={dangGui || !henLuc} onClick={() => lam("hen-gio", { henLuc: sangIso(henLuc) })}>Hẹn giờ</button>
          </div>
        )}
        {phaiDuyet && !quyen.dang && quyen.guiDuyet && <div className="hop-thong-bao thong-tin">Bài do AI soạn — phải được duyệt trước khi đăng.</div>}
        {quyen.guiDuyet && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="nho">Duyệt xong thì</span>
              <select value={cheDo} onChange={(e) => datCheDo(e.target.value as typeof cheDo)}>
                <option value="khong">Để người có quyền đăng chọn giờ</option>
                <option value="ngay">Đăng ngay</option>
                <option value="hen-gio">Đăng vào giờ hẹn</option>
              </select>
            </label>
            {cheDo === "hen-gio" && <input type="datetime-local" aria-label="Giờ hẹn" value={henLuc} onChange={(e) => datHenLuc(e.target.value)} />}
            <button type="button" className="nut" disabled={dangGui || (cheDo === "hen-gio" && !henLuc)} onClick={() => lam("gui-duyet", { cheDo, henLuc: cheDo === "hen-gio" ? sangIso(henLuc) : null })}>Gửi duyệt</button>
          </div>
        )}
        {(quyen.duyet || quyen.rutDuyet) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            {quyen.duyet && (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 260px" }}>
                  <span className="nho">Ghi chú / lý do trả lại</span>
                  <input value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} maxLength={1000} />
                </label>
                <button type="button" className="nut chinh" disabled={dangGui} onClick={() => lam("duyet", { ghiChu: ghiChu || null })}>Duyệt</button>
                <button type="button" className="nut" disabled={dangGui || ghiChu.trim().length < 3} onClick={() => lam("tra-lai", { lyDo: ghiChu })}>Trả lại</button>
              </>
            )}
            {quyen.rutDuyet && <button type="button" className="nut" disabled={dangGui} onClick={() => lam("rut-duyet")}>Rút lại (về nháp)</button>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {quyen.huyLich && <button type="button" className="nut" disabled={dangGui} onClick={() => lam("huy-lich", {}, "Hủy lịch đăng bài này?")}>Hủy lịch</button>}
          {quyen.dangLai && <button type="button" className="nut chinh" disabled={dangGui} onClick={() => lam("dang-lai")}>Đăng lại các kênh lỗi</button>}
          {quyen.veNhap && <button type="button" className="nut" disabled={dangGui} onClick={() => lam("ve-nhap")}>Chuyển về nháp</button>}
          {quyen.xoa && <button type="button" className="nut" disabled={dangGui} onClick={xoa}>Xóa bài</button>}
        </div>
      </div>
    </section>
  );
}
