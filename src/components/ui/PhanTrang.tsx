import Link from "next/link";
import { dinhDangSo } from "@/lib/dinh-dang";

/**
 * Phân trang phía máy chủ bằng liên kết — giữ nguyên các bộ lọc đang có trên URL.
 * Không tải toàn bộ danh sách lên trình duyệt (mục 35 master prompt).
 */
export default function PhanTrang({
  tong,
  trang,
  coTrang,
  duongDan,
  thamSo,
}: {
  tong: number;
  trang: number;
  coTrang: number;
  duongDan: string;
  thamSo: Record<string, string>;
}) {
  const soTrang = Math.max(1, Math.ceil(tong / coTrang));
  const tu = tong === 0 ? 0 : (trang - 1) * coTrang + 1;
  const den = Math.min(tong, trang * coTrang);
  const lienKet = (t: number) => {
    const q = new URLSearchParams({ ...thamSo, trang: String(t) });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `${duongDan}?${q.toString()}`;
  };
  return (
    <div className="phan-trang">
      <span>
        {dinhDangSo(tu)}–{dinhDangSo(den)} / {dinhDangSo(tong)} bản ghi
      </span>
      <div className="nhom-nut">
        {trang > 1 ? (
          <Link className="nut nho" href={lienKet(trang - 1)}>
            ‹ Trước
          </Link>
        ) : (
          <button className="nut nho" disabled>
            ‹ Trước
          </button>
        )}
        <span className="so" style={{ alignSelf: "center" }}>
          Trang {trang}/{soTrang}
        </span>
        {trang < soTrang ? (
          <Link className="nut nho" href={lienKet(trang + 1)}>
            Sau ›
          </Link>
        ) : (
          <button className="nut nho" disabled>
            Sau ›
          </button>
        )}
      </div>
    </div>
  );
}
