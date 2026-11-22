import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Luật lint của Next.js (React, hooks, truy cập được, TypeScript). Không thêm bộ luật riêng
// cho tới khi có lý do cụ thể — ít luật mà được tuân thủ tốt hơn nhiều luật bị tắt.
const cauHinh = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["node_modules/**", ".next/**", "src/generated/**", "data/**", "next-env.d.ts",
      // Bộ chạy thử trên máy Windows: script Node thuần CommonJS, không thuộc ứng dụng.
      "may-ca-nhan/**"],
  },
  {
    // 0.23.0 (SEC-06, QĐ-194): mã web (route, trang, service) KHÔNG được import thư mục worker/ — nơi duy nhất có hàm mở
    // niêm phong bí mật mạng xã hội. Bài thử thu:mang-xa-hoi quét đồ thị import thêm một lớp.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/worker/**", "**/worker"], message: "Mã web không được import worker/ (SEC-06: chỉ worker mở niêm phong)." }] }],
    },
  },
];

export default cauHinh;
