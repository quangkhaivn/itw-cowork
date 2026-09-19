"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TrangThai from "@/components/ui/TrangThai";
import TrongRong from "@/components/ui/TrongRong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

interface Muc {
  id: string;
  ma: string;
  ten: string;
  moTa: string;
  thuTu: number;
  trangThai: string;
}

/** Bảng mục dữ liệu gốc của một loại: thêm dòng mới ở đầu, sửa ngay trên dòng. */
export default function BangMuc({
  loai,
  muc,
  duocTao,
  duocSua,
  goiYTrong,
}: {
  loai: string;
  muc: Muc[];
  duocTao: boolean;
  duocSua: boolean;
  goiYTrong?: string;
}) {
  const router = useRouter();
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [moi, datMoi] = useState({ ma: "", ten: "", thuTu: 0 });
  const [dangSua, datDangSua] = useState<Muc | null>(null);

  async function them(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi("/api/v1/du-lieu-goc", "POST", { loai, ...moi });
    if (kq) {
      datMoi({ ma: "", ten: "", thuTu: 0 });
      router.refresh();
    }
  }

  async function luuSua(e: React.FormEvent) {
    e.preventDefault();
    if (!dangSua) return;
    const kq = await goi(`/api/v1/du-lieu-goc/${dangSua.id}`, "PATCH", {
      ten: dangSua.ten,
      moTa: dangSua.moTa,
      thuTu: dangSua.thuTu,
      trangThai: dangSua.trangThai,
    });
    if (kq) {
      datDangSua(null);
      router.refresh();
    }
  }

  return (
    <>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
          {loi.thongBao}
        </div>
      )}
      {duocTao && (
        <form className="bo-loc" onSubmit={them}>
          <div className="truong rong">
            <label htmlFor="moi-ten">Tên mục mới</label>
            <input id="moi-ten" type="text" value={moi.ten} onChange={(e) => datMoi({ ...moi, ten: e.target.value })} required />
          </div>
          <div className="truong">
            <label htmlFor="moi-ma">Mã</label>
            <input
              id="moi-ma"
              type="text"
              value={moi.ma}
              onChange={(e) => datMoi({ ...moi, ma: e.target.value })}
              placeholder="vi-du: tra-truoc-50"
              aria-invalid={Boolean(loiCua(loi, "ma")) || undefined}
              required
            />
          </div>
          <div className="truong" style={{ width: 90 }}>
            <label htmlFor="moi-thutu">Thứ tự</label>
            <input
              id="moi-thutu"
              type="number"
              min={0}
              value={moi.thuTu}
              onChange={(e) => datMoi({ ...moi, thuTu: Number(e.target.value) })}
            />
          </div>
          <button className="nut chinh" type="submit" disabled={dangGui}>
            Thêm
          </button>
        </form>
      )}
      {muc.length === 0 ? (
        <TrongRong tieuDe="Chưa có mục nào">{goiYTrong}</TrongRong>
      ) : (
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Mã</th>
                <th className="so">Thứ tự</th>
                <th>Trạng thái</th>
                {duocSua && <th />}
              </tr>
            </thead>
            <tbody>
              {muc.map((m) =>
                dangSua?.id === m.id ? (
                  <tr key={m.id}>
                    <td colSpan={duocSua ? 5 : 4}>
                      <form onSubmit={luuSua} className="luoi-form" style={{ alignItems: "end" }}>
                        <div className="truong">
                          <label htmlFor={`sua-ten-${m.id}`}>Tên</label>
                          <input
                            id={`sua-ten-${m.id}`}
                            type="text"
                            value={dangSua.ten}
                            onChange={(e) => datDangSua({ ...dangSua, ten: e.target.value })}
                          />
                        </div>
                        <div className="truong">
                          <label htmlFor={`sua-thutu-${m.id}`}>Thứ tự</label>
                          <input
                            id={`sua-thutu-${m.id}`}
                            type="number"
                            min={0}
                            value={dangSua.thuTu}
                            onChange={(e) => datDangSua({ ...dangSua, thuTu: Number(e.target.value) })}
                          />
                        </div>
                        <div className="truong ca-dong">
                          <label htmlFor={`sua-mota-${m.id}`}>Ghi chú</label>
                          <input
                            id={`sua-mota-${m.id}`}
                            type="text"
                            value={dangSua.moTa}
                            onChange={(e) => datDangSua({ ...dangSua, moTa: e.target.value })}
                          />
                        </div>
                        <div className="truong">
                          <label className="o-chon">
                            <input
                              type="checkbox"
                              checked={dangSua.trangThai === "hoat-dong"}
                              onChange={(e) =>
                                datDangSua({ ...dangSua, trangThai: e.target.checked ? "hoat-dong" : "ngung-hoat-dong" })
                              }
                            />
                            <span>Đang dùng</span>
                          </label>
                        </div>
                        <div className="hanh-dong" style={{ justifyContent: "flex-end", marginBottom: 14 }}>
                          <button
                            type="button"
                            className="nut"
                            onClick={() => {
                              datDangSua(null);
                              datLoi(null);
                            }}
                          >
                            Hủy
                          </button>
                          <button type="submit" className="nut chinh" disabled={dangGui}>
                            Lưu
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className={m.trangThai !== "hoat-dong" ? "mo" : undefined}>
                    <td>
                      {m.ten}
                      {m.moTa && <div className="dong-phu">{m.moTa}</div>}
                    </td>
                    <td>
                      <code>{m.ma}</code>
                    </td>
                    <td className="so">{m.thuTu}</td>
                    <td>
                      <TrangThai giaTri={m.trangThai} />
                    </td>
                    {duocSua && (
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="nut nho"
                          onClick={() => {
                            datDangSua(m);
                            datLoi(null);
                          }}
                        >
                          Sửa
                        </button>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
