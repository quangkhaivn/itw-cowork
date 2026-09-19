"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BieuTuong from "@/components/ui/BieuTuong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

interface PhongBan {
  id: string;
  ma: string;
  ten: string;
  chaId: string;
  trangThai: string;
}

/** Một nút mở hộp thoại tạo (khi không truyền `phongBan`) hoặc sửa phòng ban. */
export default function SuaPhongBan({
  luaChonCha,
  phongBan,
}: {
  luaChonCha: { id: string; ten: string; cap: number }[];
  phongBan?: PhongBan;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const laTao = !phongBan;
  const macDinh = phongBan ?? { id: "", ma: "", ten: "", chaId: "", trangThai: "hoat-dong" };
  const [gt, datGt] = useState(macDinh);

  function mo() {
    datGt(macDinh);
    datLoi(null);
    hop.current?.showModal();
  }

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = laTao
      ? await goi("/api/v1/phong-ban", "POST", { ma: gt.ma, ten: gt.ten, chaId: gt.chaId })
      : await goi(`/api/v1/phong-ban/${gt.id}`, "PATCH", { ten: gt.ten, chaId: gt.chaId, trangThai: gt.trangThai });
    if (kq) {
      hop.current?.close();
      router.refresh();
    }
  }

  return (
    <>
      {laTao ? (
        <button className="nut chinh" onClick={mo}>
          <BieuTuong ten="them" co={16} /> Thêm phòng ban
        </button>
      ) : (
        <button className="nut nho" onClick={mo}>
          Sửa
        </button>
      )}
      <dialog ref={hop} className="hop-thoai" style={{ textAlign: "left" }}>
        <form onSubmit={gui}>
          <div className="dau">
            <h2>{laTao ? "Thêm phòng ban" : `Sửa: ${phongBan?.ten}`}</h2>
            <button type="button" className="nut trong icon" onClick={() => hop.current?.close()} aria-label="Đóng">
              <BieuTuong ten="dong" />
            </button>
          </div>
          <div className="than">
            {loi && <div className="hop-thong-bao loi">{loi.thongBao}</div>}
            <div className="truong">
              <label htmlFor={`pb-ten-${gt.id}`}>Tên phòng ban</label>
              <input id={`pb-ten-${gt.id}`} type="text" value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} required />
              {loiCua(loi, "ten") && <span className="loi-truong">{loiCua(loi, "ten")}</span>}
            </div>
            <div className="truong">
              <label htmlFor={`pb-ma-${gt.id}`}>Mã</label>
              <input
                id={`pb-ma-${gt.id}`}
                type="text"
                value={gt.ma}
                onChange={(e) => datGt({ ...gt, ma: e.target.value })}
                readOnly={!laTao}
                placeholder="vi-du: kinh-doanh-du-an"
                required
              />
              <span className={loiCua(loi, "ma") ? "loi-truong" : "goi-y"}>
                {loiCua(loi, "ma") ?? (laTao ? "Chữ thường không dấu, số, gạch ngang. Không đổi được sau khi tạo." : "Mã không đổi được.")}
              </span>
            </div>
            <div className="truong">
              <label htmlFor={`pb-cha-${gt.id}`}>Thuộc phòng ban</label>
              <select id={`pb-cha-${gt.id}`} value={gt.chaId} onChange={(e) => datGt({ ...gt, chaId: e.target.value })}>
                <option value="">— Cấp cao nhất —</option>
                {luaChonCha.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"— ".repeat(c.cap)}
                    {c.ten}
                  </option>
                ))}
              </select>
            </div>
            {!laTao && (
              <div className="truong">
                <label htmlFor={`pb-tt-${gt.id}`}>Trạng thái</label>
                <select id={`pb-tt-${gt.id}`} value={gt.trangThai} onChange={(e) => datGt({ ...gt, trangThai: e.target.value })}>
                  <option value="hoat-dong">Hoạt động</option>
                  <option value="ngung-hoat-dong">Ngừng hoạt động</option>
                </select>
                <span className="goi-y">Chỉ ngừng được khi không còn phòng con và nhân sự đang hoạt động.</span>
              </div>
            )}
            <div className="hanh-dong" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="nut" onClick={() => hop.current?.close()}>
                Hủy
              </button>
              <button type="submit" className="nut chinh" disabled={dangGui}>
                {dangGui ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
