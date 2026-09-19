import Link from "next/link";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

export interface MucDongThoiGian {
  thoiDiem: Date;
  loai: string;
  tieuDe: string;
  moTa?: string | null;
  nguoi?: string | null;
  href?: string;
}

const LOP: Record<string, string> = {
  thang: "tot",
  thua: "loi",
  "co-hoi": "chinh",
  lead: "chinh",
  "viec-xong": "tot",
};

/** Dòng thời gian hợp nhất của Customer 360 — hiển thị thuần, dữ liệu do service ghép sẵn. */
export default function DongThoiGian({ muc }: { muc: MucDongThoiGian[] }) {
  if (muc.length === 0) return <p className="phu">Chưa có hoạt động nào.</p>;
  return (
    <ol className="dong-thoi-gian">
      {muc.map((m, i) => (
        <li key={i} data-loai={LOP[m.loai] ?? ""}>
          <div className="luc so">{dinhDangNgayGio(m.thoiDiem)}</div>
          <div>
            {m.href ? <Link href={m.href}>{m.tieuDe}</Link> : <span>{m.tieuDe}</span>}
            {m.nguoi && <span className="phu"> · {m.nguoi}</span>}
            {m.moTa && <div className="phu">{m.moTa}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
