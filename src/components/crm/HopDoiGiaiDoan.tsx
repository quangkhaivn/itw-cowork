"use client";

import { useEffect, useRef, useState } from "react";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { CO_HOI_DANG_MO, NHAN_GIAI_DOAN, XAC_SUAT_GOI_Y, type GiaiDoanCoHoi } from "@/modules/crm/hang-so";

export interface YeuCauDoiGiaiDoan {
  coHoiId: string;
  tieuDe: string;
  tu: string;
  den: GiaiDoanCoHoi;
}

/**
 * Hộp thoại đổi giai đoạn cơ hội — dùng chung cho Kanban và trang chi tiết.
 * Hỏi thêm đúng những gì luật yêu cầu:
 *   - sang LOST: lý do thua (CH-03)
 *   - mở lại cơ hội đã đóng: hành động kế tiếp + ngày (CH-02)
 *   - sang giai đoạn đang mở khác: cho sửa xác suất và hành động kế tiếp (không bắt buộc)
 *
 * Phần form được dựng lại theo `key` mỗi yêu cầu mới, nên trạng thái và lỗi cũ tự mất.
 */
export default function HopDoiGiaiDoan({
  yeuCau,
  lyDoThua,
  dong,
  xong,
}: {
  yeuCau: YeuCauDoiGiaiDoan | null;
  lyDoThua: { ma: string; ten: string }[];
  dong: () => void;
  xong: () => void;
}) {
  const hop = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (yeuCau && !hop.current?.open) hop.current?.showModal();
  }, [yeuCau]);

  return (
    <HopThoai ref={hop} tieuDe={yeuCau ? `${NHAN_GIAI_DOAN[yeuCau.tu]} → ${NHAN_GIAI_DOAN[yeuCau.den]}` : "Đổi giai đoạn"} khiDong={dong}>
      {yeuCau && (
        <NoiDung
          key={`${yeuCau.coHoiId}-${yeuCau.tu}-${yeuCau.den}`}
          yeuCau={yeuCau}
          lyDoThua={lyDoThua}
          huy={() => hop.current?.close()}
          xong={() => {
            hop.current?.close();
            xong();
          }}
        />
      )}
    </HopThoai>
  );
}

function NoiDung({
  yeuCau,
  lyDoThua,
  huy,
  xong,
}: {
  yeuCau: YeuCauDoiGiaiDoan;
  lyDoThua: { ma: string; ten: string }[];
  huy: () => void;
  xong: () => void;
}) {
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState({ lyDoThua: "", ghiChuThua: "", hanhDongKeTiep: "", ngayHanhDong: "", xacSuat: String(XAC_SUAT_GOI_Y[yeuCau.den]) });
  const dangMo = (gd: string) => (CO_HOI_DANG_MO as string[]).includes(gd);
  const sangMo = dangMo(yeuCau.den);
  const moLai = sangMo && !dangMo(yeuCau.tu);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than: Record<string, unknown> = { giaiDoan: yeuCau.den };
    if (yeuCau.den === "LOST") Object.assign(than, { lyDoThua: gt.lyDoThua, ghiChuThua: gt.ghiChuThua });
    if (sangMo) {
      if (gt.hanhDongKeTiep.trim()) than.hanhDongKeTiep = gt.hanhDongKeTiep;
      if (gt.ngayHanhDong) than.ngayHanhDong = gt.ngayHanhDong;
      if (gt.xacSuat !== "") than.xacSuat = Number(gt.xacSuat);
    }
    const kq = await goi(`/api/v1/co-hoi/${yeuCau.coHoiId}/giai-doan`, "POST", than);
    if (kq) xong();
  }

  return (
    <form onSubmit={gui} noValidate>
      <div className="than">
        <p className="phu">{yeuCau.tieuDe}</p>
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        {yeuCau.den === "WON" && (
          <p>
            Đánh dấu <strong>thắng</strong>: xác suất về 100% và cơ hội được đóng.
          </p>
        )}

        {yeuCau.den === "LOST" && (
          <>
            <div className="truong">
              <label htmlFor="gd-lydo">
                Lý do thua <span className="bat-buoc">*</span>
              </label>
              <select id="gd-lydo" value={gt.lyDoThua} onChange={(e) => datGt({ ...gt, lyDoThua: e.target.value })} autoFocus>
                <option value="">— Chọn lý do —</option>
                {lyDoThua.map((l) => (
                  <option key={l.ma} value={l.ma}>
                    {l.ten}
                  </option>
                ))}
              </select>
              {loiCua(loi, "lyDoThua") && <span className="loi-truong">{loiCua(loi, "lyDoThua")}</span>}
              {lyDoThua.length === 0 && <span className="goi-y">Chưa có lý do nào. Quản trị thêm ở Dữ liệu gốc → Lý do thua cơ hội.</span>}
            </div>
            <div className="truong">
              <label htmlFor="gd-ghichu">Ghi chú (đối thủ, mức giá…)</label>
              <textarea id="gd-ghichu" rows={2} value={gt.ghiChuThua} onChange={(e) => datGt({ ...gt, ghiChuThua: e.target.value })} />
            </div>
          </>
        )}

        {sangMo && (
          <>
            {moLai && (
              <div className="hop-thong-bao thong-tin">Mở lại cơ hội đã đóng. Cơ hội đang mở phải có hành động kế tiếp và ngày thực hiện.</div>
            )}
            <div className="truong">
              <label htmlFor="gd-hanhdong">Hành động kế tiếp {moLai && <span className="bat-buoc">*</span>}</label>
              <input
                id="gd-hanhdong"
                type="text"
                value={gt.hanhDongKeTiep}
                placeholder={moLai ? "" : "Để trống = giữ nguyên"}
                onChange={(e) => datGt({ ...gt, hanhDongKeTiep: e.target.value })}
              />
              {loiCua(loi, "hanhDongKeTiep") && <span className="loi-truong">{loiCua(loi, "hanhDongKeTiep")}</span>}
            </div>
            <div className="luoi-form">
              <div className="truong">
                <label htmlFor="gd-ngay">Ngày thực hiện {moLai && <span className="bat-buoc">*</span>}</label>
                <input id="gd-ngay" type="date" value={gt.ngayHanhDong} onChange={(e) => datGt({ ...gt, ngayHanhDong: e.target.value })} />
                {loiCua(loi, "ngayHanhDong") && <span className="loi-truong">{loiCua(loi, "ngayHanhDong")}</span>}
              </div>
              <div className="truong">
                <label htmlFor="gd-xacsuat">Xác suất (%)</label>
                <input id="gd-xacsuat" type="number" min={0} max={100} value={gt.xacSuat} onChange={(e) => datGt({ ...gt, xacSuat: e.target.value })} />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="chan-form">
        <button type="button" className="nut" onClick={huy}>
          Hủy
        </button>
        <button
          type="submit"
          className={`nut ${yeuCau.den === "LOST" ? "nguy-hiem" : "chinh"}`}
          disabled={dangGui || (yeuCau.den === "LOST" && !gt.lyDoThua) || (moLai && (!gt.hanhDongKeTiep.trim() || !gt.ngayHanhDong))}
        >
          {dangGui ? "Đang lưu…" : `Chuyển sang ${NHAN_GIAI_DOAN[yeuCau.den]}`}
        </button>
      </div>
    </form>
  );
}
