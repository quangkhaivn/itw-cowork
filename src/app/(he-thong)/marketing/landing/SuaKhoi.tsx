"use client";

import { useState } from "react";
import KhoiLanding from "@/components/marketing/KhoiLanding";
import { khoiMoi, NHAN_KHOI, type KhoiLanding as Khoi, type LoaiKhoi } from "@/modules/marketing/khoi-landing";

/**
 * Trình sửa danh sách khối landing page (MK-16). Mỗi loại khối có ô nhập riêng khai báo
 * bằng mã — không có ô HTML / CSS / script. Máy chủ kiểm lại bằng Zod khi lưu.
 */
export default function SuaKhoi({ khoi, datKhoi, tenBienThe }: { khoi: Khoi[]; datKhoi: (k: Khoi[]) => void; tenBienThe: string }) {
  const [them, datThem] = useState<LoaiKhoi>("doan-van");
  const sua = (i: number, k: Khoi) => datKhoi(khoi.map((x, j) => (j === i ? k : x)));
  const doiCho = (i: number, j: number) => {
    if (j < 0 || j >= khoi.length) return;
    const m = [...khoi];
    [m[i], m[j]] = [m[j], m[i]];
    datKhoi(m);
  };
  const id = (i: number, t: string) => `${tenBienThe}-${i}-${t}`;

  function oNhap(i: number, k: Khoi) {
    const truong = (t: string, nhan: string, gt: string, d: (v: string) => void, dai = false) => (
      <div className="truong" key={t}>
        <label htmlFor={id(i, t)}>{nhan}</label>
        {dai ? <textarea id={id(i, t)} rows={4} value={gt} onChange={(e) => d(e.target.value)} /> : <input id={id(i, t)} type="text" value={gt} onChange={(e) => d(e.target.value)} />}
      </div>
    );
    switch (k.loai) {
      case "tieu-de":
        return [truong("td", "Tiêu đề", k.tieuDe, (v) => sua(i, { ...k, tieuDe: v })), truong("pd", "Phụ đề", k.phuDe, (v) => sua(i, { ...k, phuDe: v }))];
      case "doan-van":
        return [truong("td", "Tiêu đề (tùy chọn)", k.tieuDe, (v) => sua(i, { ...k, tieuDe: v })), truong("nd", "Nội dung (dòng trống = đoạn mới)", k.noiDung, (v) => sua(i, { ...k, noiDung: v }), true)];
      case "anh":
        return [
          truong("url", "Địa chỉ ảnh (https://…)", k.url, (v) => sua(i, { ...k, url: v })),
          truong("mt", "Mô tả ảnh (cho người khiếm thị)", k.moTa, (v) => sua(i, { ...k, moTa: v })),
          truong("ct", "Chú thích", k.chuThich, (v) => sua(i, { ...k, chuThich: v })),
        ];
      case "loi-ich":
        return [
          truong("td", "Tiêu đề", k.tieuDe, (v) => sua(i, { ...k, tieuDe: v })),
          truong("muc", "Lợi ích (mỗi dòng một ý)", k.muc.join("\n"), (v) => sua(i, { ...k, muc: v.split("\n") }), true),
        ];
      case "nut-goi":
        return [
          truong("nhan", "Chữ trên nút", k.nhan, (v) => sua(i, { ...k, nhan: v })),
          <div className="truong" key="kieu">
            <label htmlFor={id(i, "kieu")}>Khi bấm</label>
            <select id={id(i, "kieu")} value={k.kieu} onChange={(e) => sua(i, { ...k, kieu: e.target.value as typeof k.kieu })}>
              <option value="form">Cuộn tới form đăng ký</option>
              <option value="dien-thoai">Gọi điện</option>
              <option value="lien-ket">Mở liên kết https</option>
            </select>
          </div>,
          k.kieu !== "form" && truong("gt", k.kieu === "dien-thoai" ? "Số điện thoại" : "Liên kết (https://…)", k.giaTri, (v) => sua(i, { ...k, giaTri: v })),
        ];
      case "form":
        return [truong("td", "Tiêu đề phía trên form", k.tieuDe, (v) => sua(i, { ...k, tieuDe: v }))];
      case "hoi-dap":
        return [
          truong("td", "Tiêu đề", k.tieuDe, (v) => sua(i, { ...k, tieuDe: v })),
          ...k.muc.map((m, j) => (
            <div key={`hd-${j}`} className="khoi-sua" style={{ marginBottom: 8 }}>
              <div className="than">
                {truong(`h${j}`, `Câu hỏi ${j + 1}`, m.hoi, (v) => sua(i, { ...k, muc: k.muc.map((x, z) => (z === j ? { ...x, hoi: v } : x)) }))}
                {truong(`d${j}`, "Trả lời", m.dap, (v) => sua(i, { ...k, muc: k.muc.map((x, z) => (z === j ? { ...x, dap: v } : x)) }), true)}
                <button type="button" className="nut nho trong" onClick={() => sua(i, { ...k, muc: k.muc.filter((_, z) => z !== j) })}>
                  Bỏ câu này
                </button>
              </div>
            </div>
          )),
          <button key="them" type="button" className="nut nho" onClick={() => sua(i, { ...k, muc: [...k.muc, { hoi: "", dap: "" }] })}>
            Thêm câu hỏi
          </button>,
        ];
      case "trich-dan":
        return [truong("nd", "Lời khách", k.noiDung, (v) => sua(i, { ...k, noiDung: v }), true), truong("ng", "Người nói", k.nguoi, (v) => sua(i, { ...k, nguoi: v }))];
    }
  }

  return (
    <div className="ds-khoi">
      {khoi.map((k, i) => (
        <div key={i} className="khoi-sua">
          <div className="dau">
            <strong>
              {i + 1}. {NHAN_KHOI[k.loai]}
            </strong>
            <span style={{ display: "inline-flex", gap: 4 }}>
              <button type="button" className="nut nho trong" aria-label="Lên" onClick={() => doiCho(i, i - 1)} disabled={i === 0}>
                ↑
              </button>
              <button type="button" className="nut nho trong" aria-label="Xuống" onClick={() => doiCho(i, i + 1)} disabled={i === khoi.length - 1}>
                ↓
              </button>
              <button type="button" className="nut nho trong" onClick={() => datKhoi(khoi.filter((_, j) => j !== i))}>
                Xóa
              </button>
            </span>
          </div>
          <div className="than">{oNhap(i, k)}</div>
        </div>
      ))}
      <div className="hang-nhap">
        <select aria-label="Loại khối" value={them} onChange={(e) => datThem(e.target.value as LoaiKhoi)} style={{ maxWidth: 240 }}>
          {(Object.keys(NHAN_KHOI) as LoaiKhoi[]).map((l) => (
            <option key={l} value={l}>
              {NHAN_KHOI[l]}
            </option>
          ))}
        </select>
        <button type="button" className="nut" onClick={() => datKhoi([...khoi, khoiMoi(them)])} disabled={khoi.length >= 30}>
          Thêm khối
        </button>
      </div>
    </div>
  );
}

/** Xem trước dùng đúng component dựng của trang công khai. */
export function XemTruocKhoi({ khoi }: { khoi: Khoi[] }) {
  return (
    <div className="xem-truoc-lp">
      <div className="lp-trang" style={{ padding: 8 }}>
        {khoi.map((k, i) => (
          <KhoiLanding key={i} khoi={k} form={<p className="phu">[Form đăng ký hiện ở đây]</p>} />
        ))}
      </div>
    </div>
  );
}
