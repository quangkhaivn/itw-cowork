import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Luật lint của Next.js (React, hooks, truy cập được, TypeScript). Không thêm bộ luật riêng
// cho tới khi có lý do cụ thể — ít luật mà được tuân thủ tốt hơn nhiều luật bị tắt.
const cauHinh = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["node_modules/**", ".next/**", "src/generated/**", "data/**", "next-env.d.ts"],
  },
];

export default cauHinh;
