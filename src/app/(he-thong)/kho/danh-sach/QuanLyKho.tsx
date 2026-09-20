"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import TrongRong from "@/components/ui/TrongRong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

export interface KhoHang {
  id: string;
  ma: string;
  ten: string;
  diaChi: string | null;
  ghiChu: string | null;
  macDinh: boolean;
  trangThai: string;
  soMatHang: number;
}

/**
 * Khai kho và sửa kho, ngay trên một bảng.
 *
 * Kho còn hàng thì máy chủ không cho ngừng hoạt động (KHO-07) — nếu không, hàng sẽ biến
 * mất khỏi mọi màn hình trong khi sổ sách vẫn còn.
 */
export default function QuanLyKho({ kho, duocTao, duocSua }: { kho: KhoHang[]; duocTao: boolean; duocSua: boolean }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [dangSua, datDangSua] = useState<KhoHang | null>(null);
  const [gt, datGt] = useState({ ma: "", ten: "", diaChi: "", ghiChu: "", macDinh: false, trangThai: "hoat-dong" });

  const mo = (k?: KhoHang) => {
    datLoi(null);
    datDangSua(k ?? null);
    datGt({
      ma: k?.ma ?? "",
      ten: k?.ten ?? "",
      diaChi: k?.diaChi ?? "",
      ghiChu: k?.ghiChu ?? "",
      macDinh: k?.macDinh ?? false,
      trangThai: k?.trangThai ?? "hoat-dong",
    });
    hop.current?.showModal();
  };

  async function luu() {
    const kq = dangSua
      ? await goi(`/api/v1/kho/${dangSua.id}`, "PATCH", { ten: gt.ten, diaChi: gt.diaChi, ghiChu: gt.ghiChu, macDinh: gt.macDinh, trangThai: gt.trangThai })
      : await goi("/api/v1/kho", "POST", { ma: gt.ma, ten: gt.ten, diaChi: gt.diaChi, ghiChu: gt.ghiChu, macDinh: gt.macDinh });
    if (!kq) return;
    hop.current?.close();
    router.refresh();
  }

  return (
    <section className="the">
      <div className="dau">
        <h2>Kho hàng</h2>
        {duocTao && (
          <button type="button" className="nut nho chinh" onClick={() => mo()}>
            Thêm kho
          </button>
        )}
      </div>

      {kho.length === 0 ? (
        <TrongRong tieuDe="Chưa khai kho nào">Mỗi kho là một nơi chứa hàng thật: kho công ty, kho chi nhánh, kho kỹ thuật mang đi lắp.</TrongRong>
      ) : (
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th>Kho</th>
                <th className="an-tren-dt">Địa chỉ</th>
                <th className="so">Mặt hàng đang có</th>
                <th>Trạng thái</th>
                {duocSua && <th />}
              </tr>
            </thead>
            <tbody>
              {kho.map((k) => (
                <tr key={k.id}>
                  <td>
                    <strong>{k.ten}</strong>
                    <div className="dong-phu">
                      {k.ma}
                      {k.macDinh ? " · mặc định" : ""}
                    </div>
                  </td>
                  <td className="an-tren-dt nho">{k.diaChi ?? <span className="mo">—</span>}</td>
                  <td className="so">{dinhDangSo(k.soMatHang)}</td>
                  <td>
                    <span className={`huy-hieu ${k.trangThai === "hoat-dong" ? "tot" : ""}`}>{k.trangThai === "hoat-dong" ? "Hoạt động" : "Ngừng hoạt động"}</span>
                  </td>
                  {duocSua && (
                    <td>
                      <button type="button" className="nut trong nho" onClick={() => mo(k)}>
                        Sửa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HopThoai ref={hop} tieuDe={dangSua ? `Sửa kho ${dangSua.ma}` : "Thêm kho"} rong={560} khiDong={() => datDangSua(null)}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="luoi-form">
            {!dangSua && (
              <div className="truong">
                <label htmlFor="kho-ma">
                  Mã kho <span className="bat-buoc">*</span>
                </label>
                <input id="kho-ma" type="text" value={gt.ma} onChange={(e) => datGt((c) => ({ ...c, ma: e.target.value }))} placeholder="KHO-CHINH" />
                {loiCua(loi, "ma") && <span className="loi-truong">{loiCua(loi, "ma")}</span>}
                <span className="goi-y">Mã đi theo mọi dòng thẻ kho, nên đặt xong thì giữ nguyên.</span>
              </div>
            )}
            <div className="truong">
              <label htmlFor="kho-ten">
                Tên kho <span className="bat-buoc">*</span>
              </label>
              <input id="kho-ten" type="text" value={gt.ten} onChange={(e) => datGt((c) => ({ ...c, ten: e.target.value }))} placeholder="Kho chính" />
              {loiCua(loi, "ten") && <span className="loi-truong">{loiCua(loi, "ten")}</span>}
            </div>
            <div className="truong ca-dong">
              <label htmlFor="kho-diachi">Địa chỉ</label>
              <input id="kho-diachi" type="text" value={gt.diaChi} onChange={(e) => datGt((c) => ({ ...c, diaChi: e.target.value }))} />
            </div>
            <div className="truong ca-dong">
              <label htmlFor="kho-ghichu">Ghi chú</label>
              <input id="kho-ghichu" type="text" value={gt.ghiChu} onChange={(e) => datGt((c) => ({ ...c, ghiChu: e.target.value }))} />
            </div>
            <div className="truong">
              <label className="o-chon" style={{ minHeight: 34, alignItems: "center" }}>
                <input type="checkbox" checked={gt.macDinh} onChange={(e) => datGt((c) => ({ ...c, macDinh: e.target.checked }))} />
                <span>Là kho mặc định</span>
              </label>
            </div>
            {dangSua && (
              <div className="truong">
                <label htmlFor="kho-trangthai">Trạng thái</label>
                <select id="kho-trangthai" value={gt.trangThai} onChange={(e) => datGt((c) => ({ ...c, trangThai: e.target.value }))}>
                  <option value="hoat-dong">Hoạt động</option>
                  <option value="ngung-hoat-dong">Ngừng hoạt động</option>
                </select>
                {dangSua.soMatHang > 0 && gt.trangThai === "ngung-hoat-dong" && (
                  <span className="goi-y">Kho còn {dangSua.soMatHang} mặt hàng — hệ thống sẽ chặn cho tới khi chuyển hết hàng đi.</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy
          </button>
          <button type="button" className="nut chinh" onClick={luu} disabled={dangGui || gt.ten.trim().length < 2 || (!dangSua && gt.ma.trim().length < 1)}>
            {dangGui ? "Đang lưu…" : dangSua ? "Lưu thay đổi" : "Tạo kho"}
          </button>
        </div>
      </HopThoai>
    </section>
  );
}
