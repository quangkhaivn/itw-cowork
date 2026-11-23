import type { Metadata } from "next";
import TrangPhapLy from "@/components/mang-xa-hoi/TrangPhapLy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Điều khoản sử dụng" };

/** Trang công khai nền tảng đòi khi duyệt app (0.24.0, QĐ-214) — không cần đăng nhập. */
export default async function Trang({ searchParams }: { searchParams: Promise<{ dn?: string; ma?: string }> }) {
  const q = await searchParams;
  return <TrangPhapLy trang="dieu-khoan" dn={q.dn} ma={q.ma} />;
}
