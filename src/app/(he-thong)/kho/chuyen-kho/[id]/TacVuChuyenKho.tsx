"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { kiemDongNhan } from "@/modules/chuyen-kho/tinh-toan";

interface DongPhieu {
  id: string;
  ten: string;
  soLuong: string;
  donViTinh: string | null;
}

/**
 * Ba việc của một phiếu chuyển kho: **xuất** (hàng rời kho nguồn), **nhận** (hàng vào
 * kho đích), **hủy** (chỉ khi còn nháp).
 *
 * Hộp nhận điền sẵn đúng số đã xuất, vì nhận đủ là trường hợp thường gặp. Sửa số
 * xuống thì ô lý do hiện ra ngay — hàng thiếu giữa hai kho không được lặng lẽ (CK-04).
 */
export default function TacVuChuyenKho({
  id,
  so,
  dong,
  duocXuat,
  duocNhan,
  duocHuy,
}: {
  id: string;
  so: string;
  dong: DongPhieu[];
  duocXuat: boolean;
  duocNhan: boolean;
  duocHuy: boolean;
}) {
  const router = useRouter();
  const hopXuat = useRef<HTMLDialogElement | null>(null);
  const hopNhan = useRef<HTMLDialogElement | null>(null);
  const hopHuy = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();

  const [ghiChu, datGhiChu] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [nhan, datNhan] = useState<Record<string, { soLuong: string; ghiChu: string }>>({});

  function moNhan() {
    datLoi(null);
    datGhiChu("");
    datNhan(Object.fromEntries(dong.map((d) => [d.id, { soLuong: d.soLuong, ghiChu: "" }])));
    hopNhan.current?.showModal();
  }

  const kiem = dong.map((d) => {
    const x = nhan[d.id] ?? { soLuong: d.soLuong, ghiChu: "" };
    return { dong: d, ...kiemDongNhan(d.soLuong, x.soLuong, x.ghiChu) };
  });
  const coLoiNhan = kiem.some((k) => !k.hopLe);

  async function xuat() {
    const kq = await goi(`/api/v1/chuyen-kho/${id}/xuat`, "POST", { ghiChu });
    if (!kq) return;
    hopXuat.current?.close();
    router.refresh();
  }

  async function nhanHang() {
    const ds = dong
      .map((d) => ({ dongId: d.id, ...(nhan[d.id] ?? { soLuong: d.soLuong, ghiChu: "" }) }))
      .map((x) => ({ dongId: x.dongId, soLuongNhan: x.soLuong, ghiChu: x.ghiChu }));
    const kq = await goi(`/api/v1/chuyen-kho/${id}/nhan`, "POST", { ghiChu, dong: ds });
    if (!kq) return;
    hopNhan.current?.close();
    router.refresh();
  }

  async function huy() {
    const kq = await goi(`/api/v1/chuyen-kho/${id}/huy`, "POST", { lyDo });
    if (!kq) return;
    hopHuy.current?.close();
    router.refresh();
  }

  return (
    <>
      {duocXuat && (
        <button
          type="button"
          className="nut chinh"
          onClick={() => {
            datLoi(null);
            datGhiChu("");
            hopXuat.current?.showModal();
          }}
        >
          Xuất khỏi kho nguồn
        </button>
      )}
      {duocNhan && (
        <button type="button" className="nut chinh" onClick={moNhan}>
          Nhận vào kho đích
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
          Hủy phiếu
        </button>
      )}

      <HopThoai ref={hopXuat} tieuDe={`Xuất khỏi kho nguồn — ${so}`} rong={560}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Bấm xuất là hàng <strong>thật sự</strong> rời kho nguồn: tồn kho nguồn giảm ngay, kho đích{" "}
            <strong>chưa</strong> tăng, và số sê-ri chuyển sang &ldquo;đang chuyển&rdquo;. Xuất rồi thì không sửa và
            không hủy phiếu được nữa.
          </p>
          <div className="truong">
            <label htmlFor="ck-xuat-ghichu">Ghi chú khi xuất</label>
            <input
              id="ck-xuat-ghichu"
              type="text"
              value={ghiChu}
              onChange={(e) => datGhiChu(e.target.value)}
              placeholder="Ví dụ: gửi xe nhà xe Phương Trang, chuyến 14 giờ"
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopXuat.current?.close()} disabled={dangGui}>
            Để sau
          </button>
          <button type="button" className="nut chinh" onClick={xuat} disabled={dangGui}>
            {dangGui ? "Đang ghi…" : "Xuất khỏi kho nguồn"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopNhan} tieuDe={`Nhận vào kho đích — ${so}`} rong={720}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Điền sẵn đúng số đã xuất. Đếm thực tế thiếu thì sửa số xuống và ghi rõ vì sao — hàng đã rời kho nguồn mà
            không tới kho đích thì phải có người trả lời câu hỏi &ldquo;đi đâu&rdquo;.
          </p>

          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Hàng</th>
                  <th className="so" style={{ width: 90 }}>
                    Đã xuất
                  </th>
                  <th className="so" style={{ width: 110 }}>
                    Thực nhận
                  </th>
                  <th style={{ width: 260 }}>Vì sao thiếu</th>
                </tr>
              </thead>
              <tbody>
                {dong.map((d, i) => {
                  const x = nhan[d.id] ?? { soLuong: d.soLuong, ghiChu: "" };
                  const k = kiem[i];
                  const thieu = Number(x.soLuong) < Number(d.soLuong);
                  return (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.ten}</strong>
                      </td>
                      <td className="so">
                        {d.soLuong}
                        {d.donViTinh ? ` ${d.donViTinh}` : ""}
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Số thực nhận của ${d.ten}`}
                          value={x.soLuong}
                          className={k.hopLe ? undefined : "loi"}
                          onChange={(e) => datNhan((c) => ({ ...c, [d.id]: { ...x, soLuong: e.target.value } }))}
                        />
                      </td>
                      <td>
                        {thieu ? (
                          <input
                            type="text"
                            aria-label={`Vì sao thiếu ${d.ten}`}
                            value={x.ghiChu}
                            onChange={(e) => datNhan((c) => ({ ...c, [d.id]: { ...x, ghiChu: e.target.value } }))}
                            placeholder="Ví dụ: thùng rách, đã lập biên bản với nhà xe"
                          />
                        ) : (
                          <span className="phu">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {coLoiNhan && (
            <div className="hop-thong-bao canh-bao" role="alert">
              {kiem.find((k) => !k.hopLe)?.lyDo}
            </div>
          )}

          <div className="truong">
            <label htmlFor="ck-nhan-ghichu">Ghi chú khi nhận</label>
            <input id="ck-nhan-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopNhan.current?.close()} disabled={dangGui}>
            Để sau
          </button>
          <button type="button" className="nut chinh" onClick={nhanHang} disabled={dangGui || coLoiNhan}>
            {dangGui ? "Đang ghi…" : "Nhận vào kho đích"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopHuy} tieuDe={`Hủy phiếu ${so}`} rong={480}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="ck-huy-lydo">
              Lý do hủy <span className="bat-buoc">*</span>
            </label>
            <input
              id="ck-huy-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: chi nhánh kia đã có hàng, không cần điều nữa"
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopHuy.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={huy} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Hủy phiếu"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
