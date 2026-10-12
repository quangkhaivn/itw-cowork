import type { KhoiLanding as Khoi } from "@/modules/marketing/khoi-landing";

/**
 * Dựng một khối landing page (MK-16). Chỉ dựng bằng phần tử React — chữ được React tự thoát,
 * không có `dangerouslySetInnerHTML`, ảnh và liên kết đã được Zod giới hạn ở https.
 * Dùng chung cho trang công khai và khung xem trước ở màn hình sửa.
 */
export default function KhoiLanding({ khoi, form }: { khoi: Khoi; form: React.ReactNode }) {
  switch (khoi.loai) {
    case "tieu-de":
      return (
        <header className="lp-khoi lp-dau">
          <h1>{khoi.tieuDe}</h1>
          {khoi.phuDe && <p>{khoi.phuDe}</p>}
        </header>
      );
    case "doan-van":
      return (
        <section className="lp-khoi">
          {khoi.tieuDe && <h2>{khoi.tieuDe}</h2>}
          {khoi.noiDung.split(/\n{2,}/).map((d, i) => (
            <p key={i} style={{ whiteSpace: "pre-line" }}>
              {d}
            </p>
          ))}
        </section>
      );
    case "anh":
      return (
        <figure className="lp-khoi lp-anh">
          {/* Ảnh ngoài do người dùng nhập URL — dùng <img> thường, không qua bộ tối ưu ảnh của Next. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={khoi.url} alt={khoi.moTa} loading="lazy" referrerPolicy="no-referrer" />
          {khoi.chuThich && <figcaption>{khoi.chuThich}</figcaption>}
        </figure>
      );
    case "loi-ich":
      return (
        <section className="lp-khoi">
          {khoi.tieuDe && <h2>{khoi.tieuDe}</h2>}
          <ul className="lp-loi-ich">
            {khoi.muc.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      );
    case "nut-goi": {
      const href = khoi.kieu === "form" ? "#dang-ky" : khoi.kieu === "dien-thoai" ? `tel:${khoi.giaTri.replace(/[^\d+]/g, "")}` : khoi.giaTri;
      return (
        <div className="lp-khoi lp-giua">
          <a className="nut chinh lp-nut" href={href} {...(khoi.kieu === "lien-ket" ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>
            {khoi.nhan}
          </a>
        </div>
      );
    }
    case "form":
      return (
        <section className="lp-khoi the lp-form" id="dang-ky">
          {khoi.tieuDe && <h2>{khoi.tieuDe}</h2>}
          {form ?? <p className="phu">Form đăng ký đang tạm đóng.</p>}
        </section>
      );
    case "hoi-dap":
      return (
        <section className="lp-khoi">
          {khoi.tieuDe && <h2>{khoi.tieuDe}</h2>}
          {khoi.muc.map((m, i) => (
            <details key={i} className="lp-hoi-dap">
              <summary>{m.hoi}</summary>
              <p style={{ whiteSpace: "pre-line" }}>{m.dap}</p>
            </details>
          ))}
        </section>
      );
    case "trich-dan":
      return (
        <blockquote className="lp-khoi lp-trich-dan">
          <p style={{ whiteSpace: "pre-line" }}>“{khoi.noiDung}”</p>
          {khoi.nguoi && <cite>— {khoi.nguoi}</cite>}
        </blockquote>
      );
  }
}
