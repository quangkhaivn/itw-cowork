"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import BieuTuong from "@/components/ui/BieuTuong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

export interface GiaTriNcc {
  id?: string;
  ten: string;
  maSoThue: string;
  nguoiLienHe: string;
  dienThoai: string;
  email: string;
  diaChi: string;
  website: string;
  dieuKhoanThanhToan: string;
  soNgayGiao: string;
  ghiChu: string;
  trangThai: string;
}

const RONG: GiaTriNcc = {
  ten: "", maSoThue: "", nguoiLienHe: "", dienThoai: "", email: "", diaChi: "", website: "",
  dieuKhoanThanhToan: "", soNgayGiao: "", ghiChu: "", trangThai: "hoat-dong",
};

/**
 * Hộp thoại thêm / sửa nhà cung cấp. Dùng ở cả trang danh sách (thêm) và trang chi tiết (sửa).
 * `moNgay` để nút "+ Tạo mới" trên thanh trên mở thẳng hộp thoại.
 */
export default function FormNhaCungCap({
  banDau,
  dieuKhoan,
  nhanNut = "Thêm nhà cung cấp",
  lopNut = "nut chinh",
  moNgay = false,
}: {
  banDau?: GiaTriNcc;
  dieuKhoan: { ma: string; ten: string }[];
  nhanNut?: string;
  lopNut?: string;
  moNgay?: boolean;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const laSua = Boolean(banDau?.id);
  const [gt, datGt] = useState<GiaTriNcc>(banDau ?? RONG);

  useEffect(() => {
    if (moNgay && !hop.current?.open) hop.current?.showModal();
  }, [moNgay]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = { ...gt, id: undefined, ...(laSua ? {} : { trangThai: undefined }) };
    const kq = laSua
      ? await goi(`/api/v1/nha-cung-cap/${banDau!.id}`, "PATCH", than)
      : await goi<{ id: string }>("/api/v1/nha-cung-cap", "POST", than);
    if (kq) {
      hop.current?.close();
      if (laSua) router.refresh();
      else router.push(`/san-pham/nha-cung-cap/${(kq as { id: string }).id}`);
    }
  }

  const o = (k: keyof GiaTriNcc, nhan: string, kieu = "text", batBuoc = false) => (
    <div className="truong">
      <label htmlFor={`ncc-${k}`}>
        {nhan} {batBuoc && <span className="bat-buoc">*</span>}
      </label>
      <input
        id={`ncc-${k}`}
        type={kieu}
        value={gt[k] as string}
        onChange={(e) => datGt({ ...gt, [k]: e.target.value })}
        aria-invalid={loiCua(loi, k) ? true : undefined}
      />
      {loiCua(loi, k) && <span className="loi-truong">{loiCua(loi, k)}</span>}
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={lopNut}
        onClick={() => {
          datLoi(null);
          datGt(banDau ?? RONG);
          hop.current?.showModal();
        }}
      >
        {!laSua && <BieuTuong ten="them" co={16} />} {nhanNut}
      </button>
      <HopThoai ref={hop} tieuDe={laSua ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"} rong={640}>
        <form onSubmit={gui} noValidate>
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <div className="luoi-form">
              <div className="truong ca-dong">
                <label htmlFor="ncc-ten">
                  Tên nhà cung cấp <span className="bat-buoc">*</span>
                </label>
                <input id="ncc-ten" type="text" value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} aria-invalid={loiCua(loi, "ten") ? true : undefined} />
                {loiCua(loi, "ten") && <span className="loi-truong">{loiCua(loi, "ten")}</span>}
              </div>
              {o("maSoThue", "Mã số thuế")}
              {o("nguoiLienHe", "Người liên hệ")}
              {o("dienThoai", "Điện thoại", "tel")}
              {o("email", "Email", "email")}
              <div className="truong">
                <label htmlFor="ncc-dk">Điều khoản thanh toán</label>
                <select id="ncc-dk" value={gt.dieuKhoanThanhToan} onChange={(e) => datGt({ ...gt, dieuKhoanThanhToan: e.target.value })}>
                  <option value="">— Chưa chọn —</option>
                  {dieuKhoan.map((d) => (
                    <option key={d.ma} value={d.ma}>
                      {d.ten}
                    </option>
                  ))}
                </select>
                {dieuKhoan.length === 0 && <span className="goi-y">Chưa khai điều khoản nào ở Dữ liệu gốc.</span>}
              </div>
              {o("soNgayGiao", "Số ngày giao thường lệ", "number")}
              <div className="truong ca-dong">
                <label htmlFor="ncc-diaChi">Địa chỉ</label>
                <input id="ncc-diaChi" type="text" value={gt.diaChi} onChange={(e) => datGt({ ...gt, diaChi: e.target.value })} />
              </div>
              {o("website", "Website")}
            </div>
            <div className="truong">
              <label htmlFor="ncc-ghiChu">Ghi chú</label>
              <textarea id="ncc-ghiChu" rows={2} value={gt.ghiChu} onChange={(e) => datGt({ ...gt, ghiChu: e.target.value })} />
            </div>
            {laSua && (
              <label className="o-chon">
                <input
                  type="checkbox"
                  checked={gt.trangThai !== "hoat-dong"}
                  onChange={(e) => datGt({ ...gt, trangThai: e.target.checked ? "ngung-hoat-dong" : "hoat-dong" })}
                />
                <span>
                  Ngừng hợp tác
                  <small>Chỉ ngừng được khi không còn dòng giá đang dùng trong bảng giá sản phẩm.</small>
                </span>
              </label>
            )}
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hop.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="nut chinh" disabled={dangGui || gt.ten.trim().length < 2}>
              {dangGui ? "Đang lưu…" : laSua ? "Lưu thay đổi" : "Tạo nhà cung cấp"}
            </button>
          </div>
        </form>
      </HopThoai>
    </>
  );
}
