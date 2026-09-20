"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Hai việc làm ngay trên bảng tồn kho: điều chỉnh sau kiểm kê, và đặt mức tồn tối thiểu
 * để hệ thống cảnh báo sắp hết hàng. Điều chỉnh luôn bắt ghi lý do (KHO-03).
 */
export default function TacVuTonKho({
  khoId,
  khoTen,
  sanPhamId,
  sanPhamTen,
  tonHienTai,
  mucToiThieu,
  duocSua,
}: {
  khoId: string;
  khoTen: string;
  sanPhamId: string;
  sanPhamTen: string;
  tonHienTai: number;
  mucToiThieu: number | null;
  duocSua: boolean;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [viec, datViec] = useState<"dieu-chinh" | "muc-ton">("dieu-chinh");
  const [chieu, datChieu] = useState<"tang" | "giam">("giam");
  const [soLuong, datSoLuong] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [muc, datMuc] = useState(mucToiThieu === null ? "" : String(mucToiThieu));

  if (!duocSua) return null;

  const mo = (v: "dieu-chinh" | "muc-ton") => {
    datViec(v);
    datLoi(null);
    datSoLuong("");
    datLyDo("");
    hop.current?.showModal();
  };

  async function chay() {
    const kq =
      viec === "dieu-chinh"
        ? await goi("/api/v1/kho/dieu-chinh", "POST", { khoId, sanPhamId, chieu, soLuong, lyDo })
        : await goi("/api/v1/kho/muc-ton", "PATCH", { sanPhamId, mucToiThieu: muc.trim() === "" ? null : muc });
    if (!kq) return;
    hop.current?.close();
    router.refresh();
  }

  return (
    <>
      <div className="tac-vu-viec">
        <button type="button" className="nut trong nho" onClick={() => mo("dieu-chinh")}>
          Điều chỉnh
        </button>
        <button type="button" className="nut trong nho" onClick={() => mo("muc-ton")}>
          Mức tối thiểu
        </button>
      </div>

      <HopThoai ref={hop} tieuDe={viec === "dieu-chinh" ? "Điều chỉnh tồn kho" : "Mức tồn tối thiểu"} rong={520}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            {sanPhamTen} · {khoTen} · đang có <strong>{tonHienTai}</strong>
          </p>

          {viec === "dieu-chinh" ? (
            <>
              <div className="luoi-form">
                <div className="truong">
                  <label htmlFor="dc-chieu">Chiều</label>
                  <select id="dc-chieu" value={chieu} onChange={(e) => datChieu(e.target.value as "tang" | "giam")}>
                    <option value="giam">Giảm (kiểm kê thiếu, hỏng, mất)</option>
                    <option value="tang">Tăng (kiểm kê thừa, tìm lại được)</option>
                  </select>
                </div>
                <div className="truong">
                  <label htmlFor="dc-soluong">Số lượng</label>
                  <input id="dc-soluong" type="text" inputMode="decimal" value={soLuong} onChange={(e) => datSoLuong(e.target.value)} />
                </div>
              </div>
              <div className="truong">
                <label htmlFor="dc-lydo">
                  Lý do <span className="bat-buoc">*</span>
                </label>
                <input id="dc-lydo" type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} placeholder="Ví dụ: kiểm kê tháng 9 thiếu 2 cái" />
                <span className="goi-y">Điều chỉnh ghi thẳng vào thẻ kho và không xóa được — lý do là để sau này còn tra.</span>
              </div>
            </>
          ) : (
            <div className="truong">
              <label htmlFor="mt-muc">Cảnh báo khi hàng còn bán được ít hơn</label>
              <input id="mt-muc" type="text" inputMode="decimal" value={muc} onChange={(e) => datMuc(e.target.value)} placeholder="Để trống = không cảnh báo" />
              <span className="goi-y">Mức này áp cho sản phẩm trên mọi kho.</span>
            </div>
          )}
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy
          </button>
          <button
            type="button"
            className="nut chinh"
            onClick={chay}
            disabled={dangGui || (viec === "dieu-chinh" && (soLuong.trim() === "" || lyDo.trim().length < 2))}
          >
            {dangGui ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
