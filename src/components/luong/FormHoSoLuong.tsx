"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import {
  CACH_TRA,
  LOAI_HOP_DONG,
  NHAN_CACH_TRA,
  NHAN_LOAI_HOP_DONG,
  NHAN_PHUONG_PHAP_THUE,
  PHUONG_PHAP_THUE,
  THUE_GOI_Y,
  type LoaiHopDong,
} from "@/modules/luong/tinh-toan";

/**
 * Tạo PHIÊN BẢN hồ sơ lương mới (LU-02): mọi trường của phiên bản hiện hành điền sẵn, đổi gì thì lưu thành bản mới
 * có hiệu lực từ ngày chọn. Bản cũ giữ nguyên (lịch sử). Kiểm tra thật nằm ở máy chủ.
 */

export interface HoSoDau {
  loaiHopDong: LoaiHopDong;
  tyLeThuViec: number | null;
  cachTra: string;
  luongCoBan: number;
  luongDongBH: number;
  thuongKpi: number;
  huongHoaHong: boolean;
  phuongPhapThue: string;
  phuCap: { loaiId: string; soTien: number }[];
  soTaiKhoan: string | null;
  nganHang: string | null;
  chuTaiKhoan: string | null;
  maSoThue: string | null;
}

const tienChu = (n: number | null | undefined) => (n ? n.toLocaleString("vi-VN") : "");

export default function FormHoSoLuong({
  nhanVien,
  loaiPhuCap,
  nguoiId,
  dau,
  homNay,
  nhanNut = "Lập / đổi hồ sơ lương",
}: {
  nhanVien: { id: string; hoTen: string }[];
  loaiPhuCap: { id: string; ten: string; theo: string; chiuThue: boolean }[];
  nguoiId?: string;
  dau?: HoSoDau | null;
  homNay: string;
  nhanNut?: string;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const khoiTao = () => ({
    nguoiId: nguoiId ?? nhanVien[0]?.id ?? "",
    hieuLucTu: homNay,
    loaiHopDong: (dau?.loaiHopDong ?? "chinh-thuc") as LoaiHopDong,
    tyLeThuViec: dau?.tyLeThuViec ? String(dau.tyLeThuViec) : "85",
    cachTra: dau?.cachTra ?? "thang",
    luongCoBan: tienChu(dau?.luongCoBan),
    luongDongBH: tienChu(dau?.luongDongBH),
    thuongKpi: tienChu(dau?.thuongKpi),
    huongHoaHong: dau?.huongHoaHong ?? false,
    phuongPhapThue: dau?.phuongPhapThue ?? "luy-tien",
    phuCap: Object.fromEntries((dau?.phuCap ?? []).map((p) => [p.loaiId, tienChu(p.soTien)])) as Record<string, string>,
    soTaiKhoan: dau?.soTaiKhoan ?? "",
    nganHang: dau?.nganHang ?? "",
    chuTaiKhoan: dau?.chuTaiKhoan ?? "",
    maSoThue: dau?.maSoThue ?? "",
    ghiChu: "",
  });
  const [g, datG] = useState(khoiTao);
  const doi = <K extends keyof ReturnType<typeof khoiTao>>(k: K, v: ReturnType<typeof khoiTao>[K]) => datG((x) => ({ ...x, [k]: v }));

  function mo() {
    datG(khoiTao());
    datLoi(null);
    hop.current?.showModal();
  }

  async function luu() {
    const than = {
      ...g,
      tyLeThuViec: g.loaiHopDong === "thu-viec" ? Number(g.tyLeThuViec) : null,
      luongDongBH: g.luongDongBH || 0,
      thuongKpi: g.thuongKpi || 0,
      phuCap: Object.entries(g.phuCap).filter(([, v]) => v && v !== "0").map(([loaiId, soTien]) => ({ loaiId, soTien })),
    };
    if (await goi("/api/v1/luong/ho-so", "POST", than)) {
      hop.current?.close();
      router.refresh();
    }
  }

  const o = (ten: string, nhan: string, nhap: React.ReactNode, goiY?: string, caDong = false) => (
    <div className={`truong${caDong ? " ca-dong" : ""}`}>
      <label htmlFor={`hs-${ten}`}>{nhan}</label>
      {nhap}
      {goiY && <span className="goi-y">{goiY}</span>}
      {loiCua(loi, ten) && <span className="loi-truong">{loiCua(loi, ten)}</span>}
    </div>
  );

  return (
    <>
      <button type="button" className="nut chinh" onClick={mo}>{nhanNut}</button>
      <HopThoai ref={hop} tieuDe="Phiên bản hồ sơ lương mới" rong={720}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <p className="goi-y">Hồ sơ lương không sửa đè: mỗi lần lưu là một phiên bản có hiệu lực từ ngày chọn. Đổi lương / hết thử việc giữa tháng: kỳ lương chia theo ngày công — phần trước ngày hiệu lực tính theo mức cũ, phần sau theo mức mới.</p>
          <div className="luoi-form">
            {o("nguoiId", "Nhân viên", (
              <select id="hs-nguoiId" value={g.nguoiId} onChange={(e) => doi("nguoiId", e.target.value)} disabled={Boolean(nguoiId)}>
                {nhanVien.map((n) => <option key={n.id} value={n.id}>{n.hoTen}</option>)}
              </select>
            ))}
            {o("hieuLucTu", "Hiệu lực từ ngày", <input id="hs-hieuLucTu" type="date" value={g.hieuLucTu} onChange={(e) => doi("hieuLucTu", e.target.value)} />)}
            {o("loaiHopDong", "Loại hợp đồng", (
              <select id="hs-loaiHopDong" value={g.loaiHopDong} onChange={(e) => { const v = e.target.value as LoaiHopDong; datG((x) => ({ ...x, loaiHopDong: v, phuongPhapThue: THUE_GOI_Y[v] })); }}>
                {LOAI_HOP_DONG.map((l) => <option key={l} value={l}>{NHAN_LOAI_HOP_DONG[l]}</option>)}
              </select>
            ))}
            {g.loaiHopDong === "thu-viec" && o("tyLeThuViec", "% lương thử việc", <input id="hs-tyLeThuViec" type="number" min={1} max={100} value={g.tyLeThuViec} onChange={(e) => doi("tyLeThuViec", e.target.value)} />, "Không thấp hơn mức tối thiểu trong Tham số (mặc định 85%).")}
            {o("cachTra", "Cách trả lương", (
              <select id="hs-cachTra" value={g.cachTra} onChange={(e) => doi("cachTra", e.target.value)}>
                {CACH_TRA.map((c) => <option key={c} value={c}>{NHAN_CACH_TRA[c]}</option>)}
              </select>
            ))}
            {o("luongCoBan", g.cachTra === "thang" ? "Lương cơ bản / tháng (đ)" : g.cachTra === "ngay" ? "Lương / ngày công (đ)" : "Lương / giờ (đ)", <input id="hs-luongCoBan" inputMode="numeric" value={g.luongCoBan} onChange={(e) => doi("luongCoBan", e.target.value)} />, g.cachTra === "thang" ? "Chia theo ngày công chuẩn của tháng (theo lịch làm việc)." : undefined)}
            {o("luongDongBH", "Lương đóng bảo hiểm (đ)", <input id="hs-luongDongBH" inputMode="numeric" value={g.luongDongBH} onChange={(e) => doi("luongDongBH", e.target.value)} />, "Để trống / 0 = không tham gia bảo hiểm bắt buộc.")}
            {o("thuongKpi", "Mức thưởng KPI chuẩn (đ)", <input id="hs-thuongKpi" inputMode="numeric" value={g.thuongKpi} onChange={(e) => doi("thuongKpi", e.target.value)} />, "Nhân hệ số thưởng của phiếu đánh giá đã chốt.")}
            {o("phuongPhapThue", "Khấu trừ thuế TNCN", (
              <select id="hs-phuongPhapThue" value={g.phuongPhapThue} onChange={(e) => doi("phuongPhapThue", e.target.value)}>
                {PHUONG_PHAP_THUE.map((c) => <option key={c} value={c}>{NHAN_PHUONG_PHAP_THUE[c]}</option>)}
              </select>
            ))}
            <div className="truong ca-dong">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={g.huongHoaHong} onChange={(e) => doi("huongHoaHong", e.target.checked)} /> Hưởng hoa hồng bán hàng (theo tiền đã thu của đơn mình phụ trách)
              </label>
            </div>
            {loaiPhuCap.map((p) => o(`pc-${p.id}`, `Phụ cấp ${p.ten} (${p.theo === "ngay-cong" ? "đ / ngày công" : "đ / tháng"}${p.chiuThue ? "" : ", không chịu thuế"})`, (
              <input id={`hs-pc-${p.id}`} inputMode="numeric" value={g.phuCap[p.id] ?? ""} onChange={(e) => doi("phuCap", { ...g.phuCap, [p.id]: e.target.value })} />
            )))}
            {o("soTaiKhoan", "Số tài khoản nhận lương", <input id="hs-soTaiKhoan" value={g.soTaiKhoan} onChange={(e) => doi("soTaiKhoan", e.target.value)} />)}
            {o("nganHang", "Ngân hàng", <input id="hs-nganHang" value={g.nganHang} onChange={(e) => doi("nganHang", e.target.value)} />)}
            {o("chuTaiKhoan", "Tên chủ tài khoản", <input id="hs-chuTaiKhoan" value={g.chuTaiKhoan} onChange={(e) => doi("chuTaiKhoan", e.target.value)} />, "Trống = họ tên nhân viên.")}
            {o("maSoThue", "Mã số thuế cá nhân", <input id="hs-maSoThue" value={g.maSoThue} onChange={(e) => doi("maSoThue", e.target.value)} />)}
            {o("ghiChu", "Ghi chú (căn cứ thay đổi)", <textarea id="hs-ghiChu" rows={2} value={g.ghiChu} onChange={(e) => doi("ghiChu", e.target.value)} />, undefined, true)}
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={luu} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu phiên bản"}</button>
        </div>
      </HopThoai>
    </>
  );
}
