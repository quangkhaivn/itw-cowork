import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { voiTenant } from "@/lib/db";
import FormDangKyCongKhai from "@/components/marketing/FormDangKyCongKhai";
import { giaiTenantCongKhai } from "@/modules/marketing/cong-khai";
import { docFormCongKhai } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Trang form đăng ký công khai /f/<mã doanh nghiệp>/<slug> (MK-11, QĐ-60).
 * Giải tenant từ mã TRƯỚC khi đọc bất cứ thứ gì, rồi chỉ đọc trong `voiTenant` của đúng
 * doanh nghiệp đó. Form tắt / sai mã → 404, không nói form có tồn tại hay không.
 * Được nhúng iframe từ website https khác (QĐ-61).
 */
export default async function TrangFormCongKhai({ params }: { params: Promise<{ ma: string; slug: string }> }) {
  const { ma, slug } = await params;
  const t = await giaiTenantCongKhai(ma);
  if (!t) notFound();
  const f = await voiTenant(t.id, (tx) => docFormCongKhai(tx, slug.slice(0, 60), true));
  if (!f) notFound();
  return (
    <main className="giua lp-nen">
      <section className="the the-don" style={{ maxWidth: 520 }}>
        <h1 style={{ marginBottom: 6 }}>{f.tieuDe}</h1>
        {f.gioiThieu && <p className="phu">{f.gioiThieu}</p>}
        <FormDangKyCongKhai maDoanhNghiep={t.code} slug={f.slug} truong={f.truong} nutGui={f.nutGui} cauDongY={f.cauDongY} />
        <p className="phu nho" style={{ marginTop: 14, marginBottom: 0 }}>
          {t.name} — thông tin chỉ dùng để liên hệ tư vấn.
        </p>
      </section>
    </main>
  );
}
