import Link from "next/link";

/** Đầu mỗi trang: đường dẫn (breadcrumb), tiêu đề, mô tả ngắn, nút hành động. */
export default function DauTrang({
  tieuDe,
  moTa,
  duongDan = [],
  hanhDong,
}: {
  tieuDe: string;
  moTa?: React.ReactNode;
  duongDan?: { nhan: string; href?: string }[];
  hanhDong?: React.ReactNode;
}) {
  return (
    <div className="dau-trang">
      <div>
        {duongDan.length > 0 && (
          <nav className="duong-dan" aria-label="Đường dẫn">
            {duongDan.map((d, i) => (
              <span key={i} style={{ display: "contents" }}>
                {d.href ? <Link href={d.href}>{d.nhan}</Link> : <span>{d.nhan}</span>}
                <span aria-hidden="true">/</span>
              </span>
            ))}
            <span aria-current="page">{tieuDe}</span>
          </nav>
        )}
        <h1>{tieuDe}</h1>
        {moTa && <p className="mo-ta">{moTa}</p>}
      </div>
      {hanhDong && <div className="hanh-dong">{hanhDong}</div>}
    </div>
  );
}
