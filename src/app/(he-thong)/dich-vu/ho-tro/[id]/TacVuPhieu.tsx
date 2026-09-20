"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { NHAN_TRANG_THAI_PHIEU } from "@/modules/ho-tro/tinh-toan";

/**
 * Hành động trên một phiếu hỗ trợ: giao kỹ thuật, ghi diễn biến, đổi trạng thái, đóng phiếu.
 * Hoàn thành thì bắt ghi rõ đã xử lý thế nào (HT-05).
 */

type Viec = "giao" | "dien-bien" | "trang-thai" | null;

export default function TacVuPhieu({
  phieuId,
  trangThai,
  quyen,
  nguoiXuLy,
  nguoiXuLyHienTai,
}: {
  phieuId: string;
  trangThai: string;
  quyen: { sua: boolean; giao: boolean; ghiDienBien: boolean; doiTrangThai: boolean; dong: boolean };
  nguoiXuLy: { id: string; fullName: string }[];
  nguoiXuLyHienTai: string | null;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [viec, datViec] = useState<Viec>(null);
  const [nguoiId, datNguoiId] = useState(nguoiXuLyHienTai ?? "");
  const [noiDung, datNoiDung] = useState("");
  const [loaiDienBien, datLoaiDienBien] = useState<"ghi-chu" | "phan-hoi-khach">("phan-hoi-khach");
  const [trangThaiMoi, datTrangThaiMoi] = useState("DANG_XU_LY");
  const [cachXuLy, datCachXuLy] = useState("");

  const mo = (v: Viec, ttMoi?: string) => {
    datViec(v);
    datLoi(null);
    datNoiDung("");
    datCachXuLy("");
    if (ttMoi) datTrangThaiMoi(ttMoi);
    hop.current?.showModal();
  };

  async function chay() {
    const duong = `/api/v1/ho-tro/${phieuId}`;
    const kq =
      viec === "giao" ? await goi(`${duong}/giao`, "POST", { nguoiXuLyId: nguoiId, ghiChu: noiDung })
      : viec === "dien-bien" ? await goi(`${duong}/dien-bien`, "POST", { loai: loaiDienBien, noiDung })
      : viec === "trang-thai" ? await goi(`${duong}/trang-thai`, "POST", { trangThai: trangThaiMoi, cachXuLy, ghiChu: noiDung })
      : null;
    if (!kq) return;
    hop.current?.close();
    datViec(null);
    router.refresh();
  }

  const tieuDe = viec === "giao" ? "Giao phiếu cho kỹ thuật" : viec === "dien-bien" ? "Ghi diễn biến" : `Chuyển sang: ${NHAN_TRANG_THAI_PHIEU[trangThaiMoi] ?? trangThaiMoi}`;
  const thieu =
    (viec === "giao" && !nguoiId) ||
    (viec === "dien-bien" && noiDung.trim().length < 2) ||
    (viec === "trang-thai" && trangThaiMoi === "HOAN_THANH" && cachXuLy.trim().length < 2) ||
    (viec === "trang-thai" && trangThaiMoi === "HUY" && noiDung.trim().length < 2);

  return (
    <>
      <div className="hanh-dong">
        {quyen.ghiDienBien && (
          <button type="button" className="nut chinh" onClick={() => mo("dien-bien")}>
            Ghi diễn biến
          </button>
        )}
        {quyen.giao && (
          <button type="button" className="nut" onClick={() => mo("giao")}>
            {nguoiXuLyHienTai ? "Giao lại" : "Giao kỹ thuật"}
          </button>
        )}
        {quyen.doiTrangThai && trangThai !== "CHO_KHACH" && trangThai !== "HOAN_THANH" && (
          <button type="button" className="nut" onClick={() => mo("trang-thai", "CHO_KHACH")}>
            Chờ khách
          </button>
        )}
        {quyen.doiTrangThai && trangThai === "CHO_KHACH" && (
          <button type="button" className="nut" onClick={() => mo("trang-thai", "DANG_XU_LY")}>
            Khách đã phản hồi
          </button>
        )}
        {quyen.doiTrangThai && trangThai !== "HOAN_THANH" && (
          <button type="button" className="nut chinh" onClick={() => mo("trang-thai", "HOAN_THANH")}>
            Xử lý xong
          </button>
        )}
        {quyen.dong && (
          <button type="button" className="nut" onClick={() => mo("trang-thai", "DONG")}>
            Đóng phiếu
          </button>
        )}
        {quyen.doiTrangThai && (
          <button type="button" className="nut nguy-hiem" onClick={() => mo("trang-thai", "HUY")}>
            Hủy phiếu
          </button>
        )}
      </div>

      <HopThoai ref={hop} tieuDe={tieuDe} rong={560} khiDong={() => datViec(null)}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}

          {viec === "giao" && (
            <div className="truong">
              <label htmlFor="ht-nguoi">Kỹ thuật viên</label>
              <select id="ht-nguoi" value={nguoiId} onChange={(e) => datNguoiId(e.target.value)}>
                <option value="">— Chọn người —</option>
                {nguoiXuLy.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                  </option>
                ))}
              </select>
              <span className="goi-y">Phiếu mới được giao sẽ tự chuyển sang Đang xử lý.</span>
            </div>
          )}

          {viec === "dien-bien" && (
            <div className="truong">
              <label htmlFor="ht-loaidb">Loại</label>
              <select id="ht-loaidb" value={loaiDienBien} onChange={(e) => datLoaiDienBien(e.target.value as "ghi-chu" | "phan-hoi-khach")}>
                <option value="phan-hoi-khach">Đã liên hệ khách</option>
                <option value="ghi-chu">Ghi chú nội bộ</option>
              </select>
              <span className="goi-y">Lần liên hệ khách đầu tiên được tính là mốc phản hồi trong cam kết dịch vụ.</span>
            </div>
          )}

          {viec === "trang-thai" && trangThaiMoi === "HOAN_THANH" && (
            <div className="truong">
              <label htmlFor="ht-cachxuly">
                Đã xử lý thế nào <span className="bat-buoc">*</span>
              </label>
              <textarea id="ht-cachxuly" rows={3} value={cachXuLy} onChange={(e) => datCachXuLy(e.target.value)} placeholder="Ví dụ: thay bộ nguồn, kiểm tra chạy ổn 30 phút, bàn giao khách" />
              <span className="goi-y">Bắt buộc — đây là bằng chứng đã làm gì cho khách.</span>
            </div>
          )}

          <div className="truong">
            <label htmlFor="ht-noidung">
              {viec === "dien-bien" ? "Nội dung" : "Ghi chú"}
              {(viec === "dien-bien" || (viec === "trang-thai" && trangThaiMoi === "HUY")) && <span className="bat-buoc"> *</span>}
            </label>
            <textarea
              id="ht-noidung"
              rows={3}
              value={noiDung}
              onChange={(e) => datNoiDung(e.target.value)}
              placeholder={viec === "trang-thai" && trangThaiMoi === "HUY" ? "Vì sao hủy phiếu" : "Không bắt buộc"}
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className={`nut ${trangThaiMoi === "HUY" && viec === "trang-thai" ? "nguy-hiem" : "chinh"}`} onClick={chay} disabled={dangGui || thieu}>
            {dangGui ? "Đang lưu…" : "Xác nhận"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
