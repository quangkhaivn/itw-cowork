"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

interface Tep {
  id: string;
  tenTep: string;
  kieuTep: string;
  dungLuongGon: string;
  ghiChu: string | null;
  taiLuc: string;
  nguoiTai: { id: string; hoTen: string };
  duongDanTai: string;
}

interface KetQua {
  tep: Tep[];
  quyen: { dinhKem: boolean };
  conThemDuoc: number;
}

const DUOI_NHAN = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.docx,.xlsx,.csv,.txt";

/**
 * Khối tệp đính kèm dùng chung cho mọi trang chứng từ.
 *
 * Tự hỏi máy chủ xem người đang xem được làm gì với chứng từ này — không nhận cờ
 * quyền từ trang cha, vì trang cha có thể quên truyền và khi đó nút hiện ra cho
 * người không có quyền bấm. Ẩn nút ở giao diện vốn không phải phân quyền (mục 34),
 * nhưng cũng không nên bày ra nút chắc chắn sẽ báo lỗi.
 */
export default function KhungDinhKem({
  loai,
  doiTuongId,
  moTa,
}: {
  loai: string;
  doiTuongId: string;
  moTa?: string;
}) {
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const hopGo = useRef<HTMLDialogElement | null>(null);
  const oChonTep = useRef<HTMLInputElement | null>(null);
  const [kq, datKq] = useState<KetQua | null>(null);
  const [dangTai, datDangTai] = useState(false);
  const [loiTai, datLoiTai] = useState<string | null>(null);
  const [sapGo, datSapGo] = useState<Tep | null>(null);
  const [lyDo, datLyDo] = useState("");

  const nap = useCallback(async () => {
    const r = await fetch(`/api/v1/dinh-kem?loai=${encodeURIComponent(loai)}&doiTuong=${encodeURIComponent(doiTuongId)}`);
    if (!r.ok) return;
    datKq((await r.json()) as KetQua);
  }, [loai, doiTuongId]);

  useEffect(() => {
    // Hẹn giờ 0 ms: tránh đặt trạng thái ngay trong thân effect (render dây chuyền),
    // cùng cách chuông thông báo đã làm.
    const dau = setTimeout(() => void nap(), 0);
    return () => clearTimeout(dau);
  }, [nap]);

  async function chonTep(e: React.ChangeEvent<HTMLInputElement>) {
    const tep = e.target.files?.[0];
    if (!tep) return;
    datLoiTai(null);
    datDangTai(true);
    try {
      const form = new FormData();
      form.append("loai", loai);
      form.append("doiTuong", doiTuongId);
      form.append("tep", tep);
      const r = await fetch("/api/v1/dinh-kem", { method: "POST", body: form });
      const d = (await r.json().catch(() => ({}))) as { thongBao?: string };
      if (!r.ok) {
        datLoiTai(d.thongBao ?? `Lỗi ${r.status}.`);
        return;
      }
      await nap();
    } catch {
      datLoiTai("Không gửi được tệp lên máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally {
      datDangTai(false);
      if (oChonTep.current) oChonTep.current.value = "";
    }
  }

  async function go() {
    if (!sapGo) return;
    const r = await goi(`/api/v1/dinh-kem/${sapGo.id}/go`, "POST", { lyDo });
    if (!r) return;
    hopGo.current?.close();
    datSapGo(null);
    await nap();
  }

  const tep = kq?.tep ?? [];
  const duocDinhKem = kq?.quyen.dinhKem ?? false;
  const hetCho = (kq?.conThemDuoc ?? 1) <= 0;

  return (
    <section className="the">
      <div className="dau">
        <h2>Tệp đính kèm</h2>
        {duocDinhKem && !hetCho && (
          <label className="nut nho" style={{ cursor: "pointer", margin: 0 }}>
            {dangTai ? "Đang tải lên…" : "Thêm tệp"}
            <input
              ref={oChonTep}
              type="file"
              accept={DUOI_NHAN}
              onChange={chonTep}
              disabled={dangTai}
              style={{ display: "none" }}
            />
          </label>
        )}
      </div>

      <div className="than">
        {moTa && (
          <p className="goi-y" style={{ marginTop: 0 }}>
            {moTa}
          </p>
        )}

        {loiTai && (
          <div className="hop-thong-bao loi" role="alert">
            {loiTai}
          </div>
        )}
        {hetCho && duocDinhKem && (
          <div className="hop-thong-bao canh-bao" role="status">
            Chứng từ này đã đủ số tệp cho phép. Gỡ bớt tệp cũ trước khi thêm tệp mới.
          </div>
        )}

        {tep.length === 0 ? (
          <p className="phu" style={{ marginBottom: 0 }}>
            {duocDinhKem
              ? "Chưa có tệp nào. Nhận PDF, ảnh, Word, Excel, CSV và văn bản — tối đa 20 MB mỗi tệp."
              : "Chưa có tệp nào."}
          </p>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Tệp</th>
                  <th className="an-tren-dt">Dung lượng</th>
                  <th className="an-tren-dt">Ai tải lên</th>
                  {duocDinhKem && <th />}
                </tr>
              </thead>
              <tbody>
                {tep.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <a href={t.duongDanTai}>
                        <strong>{t.tenTep}</strong>
                      </a>
                      {t.ghiChu && <div className="dong-phu">{t.ghiChu}</div>}
                    </td>
                    <td className="an-tren-dt nho">{t.dungLuongGon}</td>
                    <td className="an-tren-dt nho">
                      {t.nguoiTai.hoTen}
                      <div className="dong-phu">{dinhDangNgayGio(t.taiLuc)}</div>
                    </td>
                    {duocDinhKem && (
                      <td>
                        <button
                          type="button"
                          className="nut trong nho"
                          onClick={() => {
                            datLoi(null);
                            datLyDo("");
                            datSapGo(t);
                            hopGo.current?.showModal();
                          }}
                        >
                          Gỡ
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <HopThoai ref={hopGo} tieuDe={`Gỡ tệp ${sapGo?.tenTep ?? ""}`} rong={480}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Tệp không hiện nữa nhưng vẫn giữ lại kèm lý do — chứng từ đã có người nhìn thấy thì không được biến mất
            không dấu vết.
          </p>
          <div className="truong">
            <label htmlFor="dk-go-lydo">
              Lý do gỡ <span className="bat-buoc">*</span>
            </label>
            <input
              id="dk-go-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: tải nhầm tệp của chứng từ khác"
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopGo.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={go} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Gỡ tệp"}
          </button>
        </div>
      </HopThoai>
    </section>
  );
}
