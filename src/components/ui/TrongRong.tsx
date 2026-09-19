/** Trạng thái trống: nói rõ vì sao trống và nên làm gì tiếp. */
export default function TrongRong({ tieuDe, children }: { tieuDe: string; children?: React.ReactNode }) {
  return (
    <div className="trong-rong">
      <strong>{tieuDe}</strong>
      {children}
    </div>
  );
}
