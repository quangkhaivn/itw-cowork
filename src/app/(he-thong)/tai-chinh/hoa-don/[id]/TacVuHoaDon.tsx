"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNhapTien } from "@/lib/dinh-dang";
import { dinhDangTien } from "@/lib/dinh-dang";
import { NHAN_PHUONG_THUC_THU, PHUONG_THUC_THU } from "@/modules/tai-chinh/tinh-toan";

/**
 * Hành động trên một hóa đơn: phát hành (chốt số tiền và hạn), thu tiền, hủy.
 * Thu tiền ở đây chỉ phân bổ cho chính hóa đơn này; thu nhiều hóa đơn một lần thì
 * dùng màn hình Phiếu thu.
 */

type Viec = "phat-hanh" | "thu-tien" | "huy" | null;

export default function TacVuHoaDon({
  hoaDonId,
  khachHangId,
  conNo,
  hanGoiY,
  quyen,
}: {
  hoaDonId: string;
  khachHangId: string;
  conNo: number;
  /** Hạn thanh toán gợi ý theo số ngày công nợ trong Cấu hình; null = chưa đặt ngưỡng. */
  hanGoiY: string | null;
  quyen: { sua: boolean; phatHanh: boolean; huy: boolean; thuTien: boolean };
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [viec, datViec] = useState<Viec>(null);
  const [ngayPhatHanh, datNgayPhatHanh] = useState(new Date().toISOString().slice(0, 10));
  const [hanThanhToan, datHanThanhToan] = useState(hanGoiY ?? "");
  const [phuongThuc, datPhuongThuc] = useState("chuyen-khoan");
  const [soTien, datSoTien] = useState(dinhDangNhapTien(String(conNo)));
  const [thamChieu, datThamChieu] = useState("");
  const [ghiChu, datGhiChu] = useState("");
  const [lyDo, datLyDo] = useState("");

  const mo = (v: Viec) => {
    datViec(v);
    datLoi(null);
    datGhiChu("");
    datLyDo("");
    if (v === "thu-tien") datSoTien(dinhDangNhapTien(String(conNo)));
    hop.current?.showModal();
  };

  async function chay() {
    const kq =
      viec === "phat-hanh" ? await goi(`/api/v1/hoa-don/${hoaDonId}/phat-hanh`, "POST", { ngayPhatHanh, hanThanhToan, ghiChu })
      : viec === "huy" ? await goi(`/api/v1/hoa-don/${hoaDonId}/huy`, "POST", { lyDo })
      : viec === "thu-tien" ? await goi("/api/v1/phieu-thu", "POST", {
          khachHangId,
          phuongThuc,
          soTien,
          ngayThu: new Date().toISOString().slice(0, 10),
          thamChieu,
          ghiChu,
          phanBo: [{ hoaDonId, soTien }],
        })
      : null;
    if (!kq) return;
    hop.current?.close();
    datViec(null);
    router.refresh();
  }

  const tieuDe = viec === "phat-hanh" ? "Phát hành hóa đơn" : viec === "thu-tien" ? "Ghi nhận tiền khách trả" : "Hủy hóa đơn";
  const thieu =
    (viec === "phat-hanh" && (!ngayPhatHanh || !hanThanhToan)) ||
    (viec === "huy" && lyDo.trim().length < 2) ||
    (viec === "thu-tien" && (soTien.replace(/\D/g, "") === "" || Number(soTien.replace(/\D/g, "")) <= 0));

  return (
    <>
      <div className="hanh-dong">
        {quyen.phatHanh && (
          <button type="button" className="nut chinh" onClick={() => mo("phat-hanh")}>
            Phát hành
          </button>
        )}
        {quyen.thuTien && (
          <button type="button" className="nut chinh" onClick={() => mo("thu-tien")}>
            Thu tiền
          </button>
        )}
        {quyen.huy && (
          <button type="button" className="nut nguy-hiem" onClick={() => mo("huy")}>
            Hủy hóa đơn
          </button>
        )}
      </div>

      <HopThoai ref={hop} tieuDe={tieuDe} rong={520} khiDong={() => datViec(null)}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}

          {viec === "phat-hanh" && (
            <>
              <p className="goi-y" style={{ marginTop: 0 }}>
                Phát hành là lúc số tiền được chốt và bắt đầu tính công nợ. Sau đó hóa đơn không sửa được nữa.
              </p>
              <div className="luoi-form">
                <div className="truong">
                  <label htmlFor="hd-ngay">Ngày phát hành</label>
                  <input id="hd-ngay" type="date" value={ngayPhatHanh} onChange={(e) => datNgayPhatHanh(e.target.value)} />
                </div>
                <div className="truong">
                  <label htmlFor="hd-han">
                    Hạn thanh toán <span className="bat-buoc">*</span>
                  </label>
                  <input id="hd-han" type="date" value={hanThanhToan} onChange={(e) => datHanThanhToan(e.target.value)} />
                  {!hanGoiY && <span className="goi-y">Chưa đặt số ngày công nợ mặc định ở Quản trị → Cấu hình nên phải tự chọn hạn.</span>}
                </div>
              </div>
            </>
          )}

          {viec === "thu-tien" && (
            <>
              <p className="goi-y" style={{ marginTop: 0 }}>
                Hóa đơn còn nợ <strong>{dinhDangTien(conNo)}</strong>. Thu bao nhiêu ghi bấy nhiêu — hệ thống không cho thu vượt phần còn nợ.
              </p>
              <div className="luoi-form">
                <div className="truong">
                  <label htmlFor="hd-pt">Hình thức</label>
                  <select id="hd-pt" value={phuongThuc} onChange={(e) => datPhuongThuc(e.target.value)}>
                    {PHUONG_THUC_THU.map((p) => (
                      <option key={p} value={p}>
                        {NHAN_PHUONG_THUC_THU[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="truong">
                  <label htmlFor="hd-tien">Số tiền</label>
                  <div className="o-tien">
                    <input id="hd-tien" type="text" inputMode="numeric" value={soTien} onChange={(e) => datSoTien(dinhDangNhapTien(e.target.value))} />
                    <span aria-hidden="true">₫</span>
                  </div>
                </div>
                <div className="truong ca-dong">
                  <label htmlFor="hd-thamchieu">Tham chiếu</label>
                  <input id="hd-thamchieu" type="text" value={thamChieu} onChange={(e) => datThamChieu(e.target.value)} placeholder="Số ủy nhiệm chi, mã giao dịch…" />
                </div>
              </div>
            </>
          )}

          {viec === "huy" && (
            <div className="truong">
              <label htmlFor="hd-lydo">
                Lý do hủy <span className="bat-buoc">*</span>
              </label>
              <input id="hd-lydo" type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} placeholder="Lập nhầm khách, khách trả hàng…" />
              <span className="goi-y">Hóa đơn không bị xóa — chuyển sang trạng thái đã hủy kèm lý do.</span>
            </div>
          )}

          {viec !== "huy" && (
            <div className="truong">
              <label htmlFor="hd-ghichu">Ghi chú</label>
              <input id="hd-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
            </div>
          )}
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className={`nut ${viec === "huy" ? "nguy-hiem" : "chinh"}`} onClick={chay} disabled={dangGui || thieu}>
            {dangGui ? "Đang lưu…" : viec === "phat-hanh" ? "Phát hành" : viec === "thu-tien" ? "Ghi nhận đã thu" : "Hủy hóa đơn"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
