import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { demVaKiem } from "@/lib/gioi-han-toc-do";
import { layIpKhach } from "@/lib/yeu-cau";
import { voiTenant } from "@/lib/db";
import { layMot, type ThamSoTrang } from "@/lib/trang";
import FormDangKyCongKhai from "@/components/marketing/FormDangKyCongKhai";
import KhoiLanding from "@/components/marketing/KhoiLanding";
import { giaiTenantCongKhai } from "@/modules/marketing/cong-khai";
import { docFormCongKhai, docLandingCongKhai } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

type ThamSo = { params: Promise<{ ma: string; slug: string }>; searchParams: ThamSoTrang };

/** Biến thể A/B: khách mang `?v=b` / `?v=a` thì theo đó (để chạy hai quảng cáo riêng); không thì ngẫu nhiên. */
function chonBienThe(v: string): "A" | "B" {
  if (v.toLowerCase() === "a") return "A";
  if (v.toLowerCase() === "b") return "B";
  return Math.random() < 0.5 ? "A" : "B";
}

export async function generateMetadata({ params }: ThamSo): Promise<Metadata> {
  const { ma, slug } = await params;
  const t = await giaiTenantCongKhai(ma);
  if (!t) return {};
  const p = await voiTenant(t.id, (tx) => docLandingCongKhai(tx, slug.slice(0, 60), "A", false));
  return p ? { title: p.tieuDe, description: p.moTa ?? undefined } : {};
}

/**
 * Landing page công khai /lp/<mã doanh nghiệp>/<slug> (MK-16, QĐ-62). Server Component dựng từ
 * khối đã kiểm Zod — không nhận HTML/script tự do. Chỉ trang đang xuất bản mới mở được.
 */
export default async function TrangLanding({ params, searchParams }: ThamSo) {
  const { ma, slug } = await params;
  const sp = await searchParams;
  const t = await giaiTenantCongKhai(ma);
  if (!t) notFound();
  const bienThe = chonBienThe(layMot(sp.v));
  // Chống thổi phồng lượt xem: mỗi IP tính tối đa 20 lượt / trang / 10 phút (cùng trần với gửi form).
  const ip = layIpKhach(await headers()) ?? "khong-ro";
  const demXem = (await demVaKiem(`lp-xem:${t.code}:${slug.slice(0, 60)}:${ip}`, 20, 600)).choPhep;
  const kq = await voiTenant(t.id, async (tx) => {
    const p = await docLandingCongKhai(tx, slug.slice(0, 60), bienThe, demXem);
    if (!p) return null;
    const f = p.formSlug ? await docFormCongKhai(tx, p.formSlug, false) : null;
    return { p, f };
  });
  if (!kq) notFound();
  const { p, f } = kq;
  const form = f ? (
    <FormDangKyCongKhai maDoanhNghiep={t.code} slug={f.slug} truong={f.truong} nutGui={f.nutGui} cauDongY={f.cauDongY} landingId={p.id} bienThe={p.bienThe} />
  ) : null;
  return (
    <main className="lp-nen">
      <div className="lp-trang">
        {p.khoi.map((k, i) => (
          <KhoiLanding key={i} khoi={k} form={form} />
        ))}
        <footer className="lp-chan phu nho">{t.name}</footer>
      </div>
    </main>
  );
}
