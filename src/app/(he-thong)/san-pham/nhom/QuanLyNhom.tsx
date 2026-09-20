"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import BieuTuong from "@/components/ui/BieuTuong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { dinhDangPhanTram, dinhDangSo } from "@/lib/dinh-dang";

interface Nhom {
  id: string;
  ma: string;
  ten: string;
  chaId: string | null;
  batBuocSerial: boolean;
  baoHanhMacDinh: number | null;
  vatMacDinh: string | null;
  trangThai: string;
  soSanPham: number;
  cap: number;
}

const RONG = { ma: "", ten: "", chaId: "", batBuocSerial: false, baoHanhMacDinh: "", vatMacDinh: "", thuTu: "0", trangThai: "hoat-dong" };

/** Cây nhóm sản phẩm + hộp thoại thêm / sửa. Nhóm quyết định mặc định bảo hành, VAT, số sê-ri. */
export default function QuanLyNhom({ nhom, duocSua }: { nhom: Nhom[]; duocSua: boolean }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [gt, datGt] = useState(RONG);
  const [dangSua, datDangSua] = useState<string | null>(null);

  function mo(n?: Nhom, chaId?: string) {
    datLoi(null);
    datDangSua(n?.id ?? null);
    datGt(
      n
        ? {
            ma: n.ma,
            ten: n.ten,
            chaId: n.chaId ?? "",
            batBuocSerial: n.batBuocSerial,
            baoHanhMacDinh: n.baoHanhMacDinh != null ? String(n.baoHanhMacDinh) : "",
            vatMacDinh: n.vatMacDinh ?? "",
            thuTu: "0",
            trangThai: n.trangThai,
          }
        : { ...RONG, chaId: chaId ?? "" },
    );
    hop.current?.showModal();
  }

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = {
      ...(dangSua ? {} : { ma: gt.ma }),
      ten: gt.ten,
      chaId: gt.chaId,
      batBuocSerial: gt.batBuocSerial,
      baoHanhMacDinh: gt.baoHanhMacDinh,
      vatMacDinh: gt.vatMacDinh,
      ...(dangSua ? { trangThai: gt.trangThai } : {}),
    };
    const kq = dangSua ? await goi(`/api/v1/nhom-san-pham/${dangSua}`, "PATCH", than) : await goi("/api/v1/nhom-san-pham", "POST", than);
    if (kq) {
      hop.current?.close();
      router.refresh();
    }
  }

  return (
    <section className="the">
      <div className="dau">
        <h2>Nhóm sản phẩm</h2>
        {duocSua && (
          <button className="nut nho" onClick={() => mo()}>
            <BieuTuong ten="them" co={14} /> Thêm nhóm
          </button>
        )}
      </div>
      <div className="cuon-ngang">
        <table className="bang">
          <thead>
            <tr>
              <th>Nhóm</th>
              <th className="so">Sản phẩm</th>
              <th className="an-tren-dt">Mặc định</th>
              <th>Trạng thái</th>
              {duocSua && <th />}
            </tr>
          </thead>
          <tbody>
            {nhom.map((n) => (
              <tr key={n.id} className={n.trangThai !== "hoat-dong" ? "mo" : undefined}>
                <td>
                  <span className="thut-le" style={{ paddingLeft: n.cap * 18 }}>
                    {n.cap > 0 && <span className="phu">└ </span>}
                    {n.ten}
                  </span>
                  <div className="dong-phu" style={{ paddingLeft: n.cap * 18 }}>
                    {n.ma}
                  </div>
                </td>
                <td className="so">{n.soSanPham ? dinhDangSo(n.soSanPham) : <span className="mo">0</span>}</td>
                <td className="an-tren-dt nho">
                  {n.baoHanhMacDinh != null ? `BH ${n.baoHanhMacDinh} tháng` : "BH —"}
                  {n.vatMacDinh ? ` · VAT ${dinhDangPhanTram(n.vatMacDinh)}` : ""}
                  {n.batBuocSerial ? " · có sê-ri" : ""}
                </td>
                <td>
                  <span className={`huy-hieu ${n.trangThai === "hoat-dong" ? "tot" : ""}`}>{n.trangThai === "hoat-dong" ? "Đang dùng" : "Ngừng"}</span>
                </td>
                {duocSua && (
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="nut nho" onClick={() => mo(n)}>
                      Sửa
                    </button>{" "}
                    <button className="nut nho" onClick={() => mo(undefined, n.id)}>
                      + Nhóm con
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HopThoai ref={hop} tieuDe={dangSua ? "Sửa nhóm sản phẩm" : "Thêm nhóm sản phẩm"} rong={560}>
        <form onSubmit={gui} noValidate>
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <div className="luoi-form">
              <div className="truong">
                <label htmlFor="nh-ten">
                  Tên nhóm <span className="bat-buoc">*</span>
                </label>
                <input id="nh-ten" type="text" value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} autoFocus />
                {loiCua(loi, "ten") && <span className="loi-truong">{loiCua(loi, "ten")}</span>}
              </div>
              {!dangSua && (
                <div className="truong">
                  <label htmlFor="nh-ma">
                    Mã <span className="bat-buoc">*</span>
                  </label>
                  <input id="nh-ma" type="text" value={gt.ma} onChange={(e) => datGt({ ...gt, ma: e.target.value })} placeholder="laptop-van-phong" />
                  <span className={loiCua(loi, "ma") ? "loi-truong" : "goi-y"}>{loiCua(loi, "ma") ?? "Chữ thường không dấu. Không đổi sau khi tạo."}</span>
                </div>
              )}
              <div className="truong">
                <label htmlFor="nh-cha">Nhóm cha</label>
                <select id="nh-cha" value={gt.chaId} onChange={(e) => datGt({ ...gt, chaId: e.target.value })}>
                  <option value="">— Nhóm gốc —</option>
                  {nhom
                    .filter((n) => n.id !== dangSua)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.cap > 0 ? `— ${n.ten}` : n.ten}
                      </option>
                    ))}
                </select>
                {loiCua(loi, "chaId") && <span className="loi-truong">{loiCua(loi, "chaId")}</span>}
              </div>
              <div className="truong">
                <label htmlFor="nh-bh">Bảo hành mặc định (tháng)</label>
                <input id="nh-bh" type="number" min={0} max={600} value={gt.baoHanhMacDinh} onChange={(e) => datGt({ ...gt, baoHanhMacDinh: e.target.value })} />
              </div>
              <div className="truong">
                <label htmlFor="nh-vat">VAT mặc định (%)</label>
                <input id="nh-vat" type="number" min={0} max={100} step="0.5" value={gt.vatMacDinh} onChange={(e) => datGt({ ...gt, vatMacDinh: e.target.value })} />
              </div>
            </div>
            <label className="o-chon">
              <input type="checkbox" checked={gt.batBuocSerial} onChange={(e) => datGt({ ...gt, batBuocSerial: e.target.checked })} />
              <span>
                Hàng trong nhóm này quản lý số sê-ri
                <small>Sản phẩm tạo mới trong nhóm sẽ bật sẵn ô này.</small>
              </span>
            </label>
            {dangSua && (
              <label className="o-chon" style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={gt.trangThai !== "hoat-dong"}
                  onChange={(e) => datGt({ ...gt, trangThai: e.target.checked ? "ngung-hoat-dong" : "hoat-dong" })}
                />
                <span>
                  Ngừng dùng nhóm này
                  <small>Chỉ ngừng được khi không còn nhóm con và sản phẩm đang kinh doanh.</small>
                </span>
              </label>
            )}
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hop.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="nut chinh" disabled={dangGui || gt.ten.trim().length < 2 || (!dangSua && !gt.ma.trim())}>
              {dangGui ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </HopThoai>
    </section>
  );
}
