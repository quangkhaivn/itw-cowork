"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface KetQua {
  loai: string;
  nhanLoai: string;
  tieuDe: string;
  phu?: string;
  href: string;
}

/**
 * Hộp tìm kiếm toàn cục (Ctrl/Cmd + K). Gõ từ 2 ký tự thì hỏi máy chủ sau 250 ms;
 * máy chủ chỉ trả những gì người dùng được phép thấy. Mũi tên lên/xuống để chọn, Enter để mở.
 */
export default function HopTimKiem({ dong }: { dong: () => void }) {
  const router = useRouter();
  const [q, datQ] = useState("");
  const [ketQua, datKetQua] = useState<{ cau: string; ds: KetQua[] }>({ cau: "", ds: [] });
  const [loi, datLoi] = useState<string | null>(null);
  const [chon, datChon] = useState(0);
  const o = useRef<HTMLInputElement>(null);

  const cau = q.trim();
  const duCau = cau.length >= 2;
  // Kết quả đang hiện có thể là của câu cũ trong lúc chờ câu mới.
  const dangTim = duCau && ketQua.cau !== cau && !loi;
  const ds = duCau ? ketQua.ds : [];

  useEffect(() => o.current?.focus(), []);

  useEffect(() => {
    if (!duCau) return;
    const huy = new AbortController();
    const hen = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/tim-kiem?q=${encodeURIComponent(cau)}`, { signal: huy.signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.thongBao ?? "Lỗi tìm kiếm");
        datKetQua({ cau, ds: d.ketQua ?? [] });
        datLoi(null);
        datChon(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") datLoi((e as Error).message);
      }
    }, 250);
    return () => {
      clearTimeout(hen);
      huy.abort();
    };
  }, [cau, duCau]);

  function mo(k: KetQua) {
    dong();
    router.push(k.href);
  }

  function phim(e: React.KeyboardEvent) {
    if (e.key === "Escape") dong();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      datChon((c) => Math.min(c + 1, ds.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      datChon((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && ds[chon]) {
      e.preventDefault();
      mo(ds[chon]);
    }
  }

  let noiDung: React.ReactNode;
  if (!duCau) noiDung = <div className="goi-y">Gõ ít nhất 2 ký tự. Esc để đóng.</div>;
  else if (loi) noiDung = <div className="goi-y" style={{ color: "var(--loi)" }}>{loi}</div>;
  else if (ds.length === 0) noiDung = <div className="goi-y">{dangTim ? "Đang tìm…" : `Không tìm thấy kết quả cho "${cau}".`}</div>;
  else
    noiDung = (
      <ul role="listbox">
        {ds.map((k, i) => (
          <li key={`${k.loai}-${k.href}`} role="option" aria-selected={i === chon}>
            <a
              href={k.href}
              data-chon={i === chon || undefined}
              onMouseEnter={() => datChon(i)}
              onClick={(e) => {
                e.preventDefault();
                mo(k);
              }}
            >
              <span className="loai">{k.nhanLoai}</span>
              <span>{k.tieuDe}</span>
              {k.phu && <span className="phu">{k.phu}</span>}
            </a>
          </li>
        ))}
      </ul>
    );

  return (
    <div
      className="hop-tim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dong();
      }}
      role="dialog"
      aria-label="Tìm kiếm"
    >
      <div className="khung">
        <input
          ref={o}
          type="search"
          value={q}
          onChange={(e) => {
            datQ(e.target.value);
            datLoi(null);
          }}
          onKeyDown={phim}
          placeholder="Gõ tên, email, số điện thoại, tên màn hình…"
          aria-label="Từ khóa tìm kiếm"
        />
        {noiDung}
      </div>
    </div>
  );
}
