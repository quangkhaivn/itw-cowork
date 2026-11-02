"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Sửa mẫu phiếu đánh giá thực tập (DG-72). Bố cục là một tài liệu JSON có cấu trúc cố định (ô thông tin,
 * phần, tiêu chí, thang chữ, ô nhận xét, ô ký, ghi chú) — máy chủ kiểm từng trường và báo lỗi tiếng Việt.
 * Sửa mẫu không đổi phiếu đã tạo (phiếu chụp mẫu lúc tạo).
 */
export default function SuaMauPhieu({ mau, mauGoc, nhanNut, lopNut = "nut chinh" }: { mau?: { id: string; ma: string; ten: string; truong: string; trangThai: string; boCuc: unknown }; mauGoc: unknown; nhanNut: string; lopNut?: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const dau = { ma: mau?.ma ?? "", ten: mau?.ten ?? "", truong: mau?.truong ?? "", trangThai: mau?.trangThai ?? "hoat-dong", boCuc: JSON.stringify(mau?.boCuc ?? mauGoc, null, 2) };
  const [gt, datGt] = useState(dau);
  const [loiJson, datLoiJson] = useState<string | null>(null);
  async function gui() {
    datLoiJson(null);
    let boCuc: unknown;
    try {
      boCuc = JSON.parse(gt.boCuc);
    } catch (e) {
      datLoiJson(`Bố cục chưa đúng dạng JSON: ${e instanceof Error ? e.message : ""}`);
      return;
    }
    if (await goi(mau ? `/api/v1/thuc-tap/mau-phieu/${mau.id}` : "/api/v1/thuc-tap/mau-phieu", mau ? "PUT" : "POST", { ...gt, boCuc })) {
      hop.current?.close();
      router.refresh();
    }
  }
  const loiTruong = loi ? Object.entries(loi.loiTruong ?? {}).filter(([, v]) => v?.length).map(([k, v]) => `${k}: ${v!.join(" ")}`) : [];
  return (
    <>
      <button type="button" className={lopNut} onClick={() => { datGt(dau); datLoi(null); datLoiJson(null); hop.current?.showModal(); }}>{nhanNut}</button>
      <HopThoai ref={hop} tieuDe={mau ? `Sửa mẫu ${mau.ten}` : "Thêm mẫu phiếu"} rong={900}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}{loiTruong.length ? <ul>{loiTruong.map((l) => <li key={l}>{l}</li>)}</ul> : null}</div>}
          {loiJson && <div className="hop-thong-bao loi" role="alert">{loiJson}</div>}
          <div className="luoi-form">
            <div className="truong"><label>Mã *</label><input value={gt.ma} onChange={(e) => datGt({ ...gt, ma: e.target.value })} placeholder="dh-bach-khoa" /></div>
            <div className="truong"><label>Tên mẫu *</label><input value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} /></div>
            <div className="truong"><label>Trường</label><input value={gt.truong} onChange={(e) => datGt({ ...gt, truong: e.target.value })} /></div>
            <div className="truong"><label>Trạng thái</label><select value={gt.trangThai} onChange={(e) => datGt({ ...gt, trangThai: e.target.value })}><option value="hoat-dong">Đang dùng</option><option value="ngung-hoat-dong">Ngừng</option></select></div>
          </div>
          <div className="truong">
            <label>Bố cục phiếu</label>
            <textarea rows={22} spellCheck={false} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} value={gt.boCuc} onChange={(e) => datGt({ ...gt, boCuc: e.target.value })} />
            <span className="goi-y">Xem hướng dẫn từng trường ở docs/HUONG-DAN-DANH-GIA.md, mục “Mẫu phiếu đánh giá thực tập”. Thang: &quot;10&quot; hoặc &quot;chu&quot;; nguồn tự động: chuyen-can, ty-le-viec-dat, chat-luong-viec.</span>
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu mẫu"}</button>
        </div>
      </HopThoai>
    </>
  );
}
