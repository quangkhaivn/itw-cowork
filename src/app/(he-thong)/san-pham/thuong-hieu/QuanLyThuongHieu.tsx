"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import BieuTuong from "@/components/ui/BieuTuong";
import TrongRong from "@/components/ui/TrongRong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

interface ThuongHieu {
  id: string;
  ma: string;
  ten: string;
  website: string | null;
  ghiChu: string | null;
  trangThai: string;
  soSanPham: number;
}

const RONG = { ma: "", ten: "", website: "", ghiChu: "", trangThai: "hoat-dong" };

/** Danh sách thương hiệu + hộp thoại thêm / sửa. */
export default function QuanLyThuongHieu({ thuongHieu, duocSua }: { thuongHieu: ThuongHieu[]; duocSua: boolean }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [gt, datGt] = useState(RONG);
  const [dangSua, datDangSua] = useState<string | null>(null);

  function mo(b?: ThuongHieu) {
    datLoi(null);
    datDangSua(b?.id ?? null);
    datGt(b ? { ma: b.ma, ten: b.ten, website: b.website ?? "", ghiChu: b.ghiChu ?? "", trangThai: b.trangThai } : RONG);
    hop.current?.showModal();
  }

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = { ...(dangSua ? { trangThai: gt.trangThai } : { ma: gt.ma }), ten: gt.ten, website: gt.website, ghiChu: gt.ghiChu };
    const kq = dangSua ? await goi(`/api/v1/thuong-hieu/${dangSua}`, "PATCH", than) : await goi("/api/v1/thuong-hieu", "POST", than);
    if (kq) {
      hop.current?.close();
      router.refresh();
    }
  }

  return (
    <section className="the">
      <div className="dau">
        <h2>Thương hiệu</h2>
        {duocSua && (
          <button className="nut nho" onClick={() => mo()}>
            <BieuTuong ten="them" co={14} /> Thêm thương hiệu
          </button>
        )}
      </div>
      {thuongHieu.length === 0 ? (
        <TrongRong tieuDe="Chưa có thương hiệu nào">{duocSua ? "Thêm Dell, HP, Hikvision… để lọc sản phẩm theo hãng." : null}</TrongRong>
      ) : (
        <table className="bang">
          <thead>
            <tr>
              <th>Thương hiệu</th>
              <th className="so">Sản phẩm</th>
              <th className="an-tren-dt">Website</th>
              <th>Trạng thái</th>
              {duocSua && <th />}
            </tr>
          </thead>
          <tbody>
            {thuongHieu.map((b) => (
              <tr key={b.id} className={b.trangThai !== "hoat-dong" ? "mo" : undefined}>
                <td>
                  {b.ten}
                  <div className="dong-phu">{b.ma}</div>
                </td>
                <td className="so">{b.soSanPham ? dinhDangSo(b.soSanPham) : <span className="mo">0</span>}</td>
                <td className="an-tren-dt">{b.website ?? <span className="mo">—</span>}</td>
                <td>
                  <span className={`huy-hieu ${b.trangThai === "hoat-dong" ? "tot" : ""}`}>{b.trangThai === "hoat-dong" ? "Đang dùng" : "Ngừng"}</span>
                </td>
                {duocSua && (
                  <td style={{ textAlign: "right" }}>
                    <button className="nut nho" onClick={() => mo(b)}>
                      Sửa
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <HopThoai ref={hop} tieuDe={dangSua ? "Sửa thương hiệu" : "Thêm thương hiệu"}>
        <form onSubmit={gui} noValidate>
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <div className="truong">
              <label htmlFor="th-ten">
                Tên <span className="bat-buoc">*</span>
              </label>
              <input id="th-ten" type="text" value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} autoFocus />
              {loiCua(loi, "ten") && <span className="loi-truong">{loiCua(loi, "ten")}</span>}
            </div>
            {!dangSua && (
              <div className="truong">
                <label htmlFor="th-ma">
                  Mã <span className="bat-buoc">*</span>
                </label>
                <input id="th-ma" type="text" value={gt.ma} onChange={(e) => datGt({ ...gt, ma: e.target.value })} placeholder="dell" />
                <span className={loiCua(loi, "ma") ? "loi-truong" : "goi-y"}>{loiCua(loi, "ma") ?? "Chữ thường không dấu. Không đổi sau khi tạo."}</span>
              </div>
            )}
            <div className="truong">
              <label htmlFor="th-web">Website</label>
              <input id="th-web" type="text" value={gt.website} onChange={(e) => datGt({ ...gt, website: e.target.value })} />
            </div>
            <div className="truong">
              <label htmlFor="th-ghichu">Ghi chú</label>
              <textarea id="th-ghichu" rows={2} value={gt.ghiChu} onChange={(e) => datGt({ ...gt, ghiChu: e.target.value })} />
            </div>
            {dangSua && (
              <label className="o-chon">
                <input
                  type="checkbox"
                  checked={gt.trangThai !== "hoat-dong"}
                  onChange={(e) => datGt({ ...gt, trangThai: e.target.checked ? "ngung-hoat-dong" : "hoat-dong" })}
                />
                <span>
                  Ngừng dùng thương hiệu này
                  <small>Chỉ ngừng được khi không còn sản phẩm đang kinh doanh mang thương hiệu.</small>
                </span>
              </label>
            )}
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hop.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="nut chinh" disabled={dangGui || !gt.ten.trim() || (!dangSua && !gt.ma.trim())}>
              {dangGui ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </HopThoai>
    </section>
  );
}
