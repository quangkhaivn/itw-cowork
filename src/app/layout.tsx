import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TGTH Business Cowork",
  description: "Hệ điều hành vận hành doanh nghiệp của Công ty Cổ phần Thế Giới Tin Học.",
};

export default function BoCucGoc({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
