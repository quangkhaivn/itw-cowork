"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BieuTuong from "@/components/ui/BieuTuong";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

interface ThongBao {
  id: string;
  loai: string;
  mucDo: string;
  tieuDe: string;
  noiDung: string | null;
  duongDan: string | null;
  daDoc: boolean;
  luc: string;
}

const NHIP_LAM_MOI_MS = 120_000;

/**
 * Chuông thông báo. Chỉ hiện thông báo của chính người đang đăng nhập (máy chủ lọc,
 * trình duyệt không gửi id người nào cả).
 *
 * Làm mới mỗi 2 phút và mỗi lần mở — đủ nhanh cho việc nhắc trong ngày, và không cần
 * dựng kênh đẩy thời gian thực cho một cái chuông.
 */
export default function Chuong() {
  const router = useRouter();
  const [mo, datMo] = useState(false);
  const [ds, datDs] = useState<ThongBao[]>([]);
  const [soChuaDoc, datSoChuaDoc] = useState(0);
  const [dangTai, datDangTai] = useState(false);
  const vung = useRef<HTMLDivElement>(null);

  const tai = useCallback(async () => {
    datDangTai(true);
    try {
      const r = await fetch("/api/v1/thong-bao?coTrang=20", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { soChuaDoc: number; dong: ThongBao[] };
      datDs(d.dong ?? []);
      datSoChuaDoc(d.soChuaDoc ?? 0);
    } catch {
      // Mất mạng thì giữ nguyên số cũ, không xóa trắng chuông.
    } finally {
      datDangTai(false);
    }
  }, []);

  useEffect(() => {
    // Hẹn giờ 0 ms cho lần đầu: tránh đặt trạng thái ngay trong thân effect (render dây chuyền).
    const dau = setTimeout(() => void tai(), 0);
    const h = setInterval(() => void tai(), NHIP_LAM_MOI_MS);
    return () => {
      clearTimeout(dau);
      clearInterval(h);
    };
  }, [tai]);

  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      if (vung.current && !vung.current.contains(e.target as Node)) datMo(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && datMo(false);
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", esc);
    };
  }, [mo]);

  async function doc(tb: ThongBao) {
    if (!tb.daDoc) {
      await fetch(`/api/v1/thong-bao/${tb.id}/doc`, { method: "POST" }).catch(() => {});
      datDs((c) => c.map((x) => (x.id === tb.id ? { ...x, daDoc: true } : x)));
      datSoChuaDoc((n) => Math.max(0, n - 1));
    }
    datMo(false);
    if (tb.duongDan) router.push(tb.duongDan);
  }

  async function docHet() {
    await fetch("/api/v1/thong-bao/doc-het", { method: "POST" }).catch(() => {});
    datDs((c) => c.map((x) => ({ ...x, daDoc: true })));
    datSoChuaDoc(0);
  }

  return (
    <div className="chuong" ref={vung}>
      <button
        className="nut trong icon"
        onClick={() => {
          datMo((m) => !m);
          if (!mo) void tai();
        }}
        aria-haspopup="menu"
        aria-expanded={mo}
        aria-label={soChuaDoc > 0 ? `Thông báo, ${soChuaDoc} chưa đọc` : "Thông báo"}
      >
        <BieuTuong ten="chuong" />
        {soChuaDoc > 0 && <span className="dau-cham" aria-hidden="true">{soChuaDoc > 9 ? "9+" : soChuaDoc}</span>}
      </button>

      {mo && (
        <div className="menu-tha rong" role="menu">
          <div className="dau-chuong">
            <strong>Thông báo</strong>
            {soChuaDoc > 0 && (
              <button type="button" className="nho" onClick={docHet}>
                Đánh dấu đã đọc hết
              </button>
            )}
          </div>
          <hr />
          {ds.length === 0 ? (
            <p className="phu nho" style={{ padding: "10px" }}>
              {dangTai ? "Đang tải…" : "Chưa có thông báo nào."}
            </p>
          ) : (
            <ul className="ds-thong-bao">
              {ds.map((tb) => (
                <li key={tb.id} className={tb.daDoc ? "da-doc" : undefined}>
                  <button type="button" onClick={() => doc(tb)}>
                    <span className={`cham-muc-do ${tb.mucDo}`} aria-hidden="true" />
                    <span className="noi-dung">
                      <span className="tieu-de">{tb.tieuDe}</span>
                      {tb.noiDung && <span className="dong-phu">{tb.noiDung}</span>}
                      <span className="dong-phu">{dinhDangNgayGio(tb.luc)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <hr />
          <Link href="/viec-hom-nay" role="menuitem" onClick={() => datMo(false)}>
            Xem Việc hôm nay
          </Link>
        </div>
      )}
    </div>
  );
}
