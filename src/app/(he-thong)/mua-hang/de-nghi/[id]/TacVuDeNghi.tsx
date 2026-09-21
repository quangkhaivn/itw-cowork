"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Các nút của một đề nghị mua: xin duyệt, duyệt / từ chối, hủy.
 *
 * Từ chối bắt buộc ghi lý do — người đề nghị phải biết vì sao bị từ chối để sửa lại,
 * chứ không phải đoán.
 */
export default function TacVuDeNghi({
  id,
  so,
  duocXinDuyet,
  duocDuyet,
  duocHuy,
}: {
  id: string;
  so: string;
  duocXinDuyet: boolean;
  duocDuyet: boolean;
  duocHuy: boolean;
}) {
  const router = useRouter();
  const hopDuyet = useRef<HTMLDialogElement | null>(null);
  const hopHuy = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [quyetDinh, datQuyetDinh] = useState<"cho-duyet" | "tu-choi">("cho-duyet");
  const [ghiChu, datGhiChu] = useState("");
  const [lyDo, datLyDo] = useState("");

  async function xinDuyet() {
    const kq = await goi(`/api/v1/de-nghi-mua/${id}/xin-duyet`, "POST", {});
    if (kq) router.refresh();
  }

  async function quyet() {
    const kq = await goi(`/api/v1/de-nghi-mua/${id}/duyet`, "POST", { quyetDinh, ghiChu });
    if (!kq) return;
    hopDuyet.current?.close();
    router.refresh();
  }

  async function huy() {
    const kq = await goi(`/api/v1/de-nghi-mua/${id}/huy`, "POST", { lyDo });
    if (!kq) return;
    hopHuy.current?.close();
    router.refresh();
  }

  return (
    <>
      {duocXinDuyet && (
        <button type="button" className="nut chinh" onClick={xinDuyet} disabled={dangGui}>
          Gửi duyệt
        </button>
      )}
      {duocDuyet && (
        <button
          type="button"
          className="nut chinh"
          onClick={() => {
            datLoi(null);
            datQuyetDinh("cho-duyet");
            datGhiChu("");
            hopDuyet.current?.showModal();
          }}
        >
          Duyệt / Từ chối
        </button>
      )}
      {duocHuy && (
        <button
          type="button"
          className="nut trong"
          onClick={() => {
            datLoi(null);
            datLyDo("");
            hopHuy.current?.showModal();
          }}
        >
          Hủy đề nghị
        </button>
      )}

      <HopThoai ref={hopDuyet} tieuDe={`Quyết định đề nghị ${so}`} rong={500}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <span className="chuoi-lua-chon">
              <label className="o-chon">
                <input type="radio" name="qd" checked={quyetDinh === "cho-duyet"} onChange={() => datQuyetDinh("cho-duyet")} />
                <span>Cho duyệt</span>
              </label>
              <label className="o-chon">
                <input type="radio" name="qd" checked={quyetDinh === "tu-choi"} onChange={() => datQuyetDinh("tu-choi")} />
                <span>Từ chối</span>
              </label>
            </span>
          </div>
          <div className="truong">
            <label htmlFor="dn-ghichu">
              Ghi chú {quyetDinh === "tu-choi" && <span className="bat-buoc">*</span>}
            </label>
            <input
              id="dn-ghichu"
              type="text"
              value={ghiChu}
              onChange={(e) => datGhiChu(e.target.value)}
              placeholder={quyetDinh === "tu-choi" ? "Vì sao không duyệt?" : "Tùy chọn"}
            />
            {quyetDinh === "tu-choi" && <span className="goi-y">Từ chối phải ghi lý do để người đề nghị biết đường sửa.</span>}
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopDuyet.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button
            type="button"
            className={quyetDinh === "tu-choi" ? "nut nguy-hiem" : "nut chinh"}
            onClick={quyet}
            disabled={dangGui || (quyetDinh === "tu-choi" && ghiChu.trim().length < 2)}
          >
            {dangGui ? "Đang lưu…" : quyetDinh === "tu-choi" ? "Từ chối" : "Cho duyệt"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopHuy} tieuDe={`Hủy đề nghị ${so}`} rong={460}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="dn-lydo">
              Lý do hủy <span className="bat-buoc">*</span>
            </label>
            <input id="dn-lydo" type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopHuy.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={huy} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Hủy đề nghị"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
