const NHAN: Record<string, { nhan: string; lop: string }> = {
  "hoat-dong": { nhan: "Hoạt động", lop: "tot" },
  "ngung-hoat-dong": { nhan: "Ngừng hoạt động", lop: "" },
};

/** Huy hiệu trạng thái chung cho các bản ghi có cột `status`. */
export default function TrangThai({ giaTri }: { giaTri: string }) {
  const m = NHAN[giaTri] ?? { nhan: giaTri, lop: "" };
  return <span className={`huy-hieu ${m.lop}`}>{m.nhan}</span>;
}
