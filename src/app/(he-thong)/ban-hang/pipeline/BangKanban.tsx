"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import HopDoiGiaiDoan, { type YeuCauDoiGiaiDoan } from "@/components/crm/HopDoiGiaiDoan";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgay, dinhDangTien } from "@/lib/dinh-dang";
import { NHAN_GIAI_DOAN, laCoHoiDangMo, type GiaiDoanCoHoi } from "@/modules/crm/hang-so";

export interface TheKanban {
  id: string;
  ma: string;
  tieuDe: string;
  phu: string | null;
  giaTri: string | null;
  xacSuat: number | null;
  hanhDong: string | null;
  ngayHanhDong: Date | null;
  quaHan: boolean;
  nguoi: string;
  href: string;
  keoDuoc: boolean;
}

export interface CotKanban {
  giaiDoan: string;
  laLead: boolean;
  soLuong: number;
  tongGiaTri: number;
  the: TheKanban[];
}

/**
 * Pipeline 8 cột: 3 cột lead + 5 cột cơ hội (mục 7 prompt).
 *
 * Kéo thẻ cơ hội sang cột khác để đổi giai đoạn:
 *   - giữa các giai đoạn đang mở: đổi ngay, giữ hành động kế tiếp
 *   - sang Thắng / Thua, hoặc mở lại cơ hội đã đóng: hỏi thêm trong hộp thoại (CH-02, CH-03, CH-06)
 * Thẻ lead không kéo được — lead thành cơ hội bằng thao tác Chuyển đổi (LD-05).
 * Trên điện thoại không kéo thả được: bấm thẻ để mở và đổi giai đoạn ở trang chi tiết.
 */
export default function BangKanban({ cot, lyDoThua, duocMoLai }: { cot: CotKanban[]; lyDoThua: { ma: string; ten: string }[]; duocMoLai: boolean }) {
  const router = useRouter();
  const { goi, loi, dangGui } = useGoiApi();
  const [keo, datKeo] = useState<{ the: TheKanban; tu: string } | null>(null);
  const [tha, datTha] = useState<string | null>(null);
  const [yeuCau, datYeuCau] = useState<YeuCauDoiGiaiDoan | null>(null);

  function nhanTha(den: string) {
    const k = keo;
    datKeo(null);
    datTha(null);
    if (!k || k.tu === den) return;
    const denGd = den as GiaiDoanCoHoi;
    if (laCoHoiDangMo(k.tu) && laCoHoiDangMo(den)) {
      void goi(`/api/v1/co-hoi/${k.the.id}/giai-doan`, "POST", { giaiDoan: den }).then((kq) => kq && router.refresh());
      return;
    }
    datYeuCau({ coHoiId: k.the.id, tieuDe: `${k.the.ma} — ${k.the.tieuDe}`, tu: k.tu, den: denGd });
  }

  const choThaVao = (c: CotKanban) =>
    !!keo && !c.laLead && c.giaiDoan !== keo.tu && (laCoHoiDangMo(keo.tu) || duocMoLai);

  return (
    <>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      {dangGui && <div className="hop-thong-bao thong-tin" role="status">Đang cập nhật…</div>}
      <div className="kanban" aria-label="Pipeline bán hàng">
        {cot.map((c) => (
          <section
            key={c.giaiDoan}
            className="cot-kanban"
            data-lead={c.laLead || undefined}
            data-tha={tha === c.giaiDoan || undefined}
            data-giai-doan={c.giaiDoan}
            onDragOver={(e) => {
              if (choThaVao(c)) {
                e.preventDefault();
                datTha(c.giaiDoan);
              }
            }}
            onDragLeave={() => datTha((t) => (t === c.giaiDoan ? null : t))}
            onDrop={(e) => {
              e.preventDefault();
              if (choThaVao(c)) nhanTha(c.giaiDoan);
            }}
          >
            <header>
              <div>
                <strong>{NHAN_GIAI_DOAN[c.giaiDoan]}</strong> <span className="dem-the">{c.soLuong}</span>
              </div>
              <div className="phu nho">{c.tongGiaTri ? dinhDangTien(c.tongGiaTri) : "—"}</div>
            </header>
            <div className="ds-the">
              {c.the.length === 0 && <p className="phu nho trong-cot">{c.laLead ? "Không có lead" : "Kéo cơ hội vào đây"}</p>}
              {c.the.map((t) => (
                <article
                  key={t.id}
                  className="the-kanban"
                  draggable={t.keoDuoc}
                  data-qua-han={t.quaHan || undefined}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", t.id);
                    datKeo({ the: t, tu: c.giaiDoan });
                  }}
                  onDragEnd={() => {
                    datKeo(null);
                    datTha(null);
                  }}
                >
                  <Link href={t.href} draggable={false}>
                    {t.tieuDe}
                  </Link>
                  {t.phu && <div className="phu nho">{t.phu}</div>}
                  <div className="dong-so">
                    <span className="so">{t.giaTri ? dinhDangTien(t.giaTri) : "—"}</span>
                    {t.xacSuat !== null && <span className="phu nho">{t.xacSuat}%</span>}
                  </div>
                  {t.hanhDong && (
                    <div className={`nho ${t.quaHan ? "chu-loi" : "phu"}`}>
                      → {t.hanhDong}
                      {t.ngayHanhDong && ` · ${dinhDangNgay(t.ngayHanhDong)}`}
                    </div>
                  )}
                  <div className="phu nho">
                    {t.ma} · {t.nguoi}
                  </div>
                </article>
              ))}
              {c.soLuong > c.the.length && (
                <p className="phu nho">
                  + {c.soLuong - c.the.length} thẻ nữa — xem ở{" "}
                  <Link href={c.laLead ? `/crm/lead?giaiDoan=${c.giaiDoan}` : `/ban-hang/co-hoi?giaiDoan=${c.giaiDoan}`}>danh sách</Link>
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
      <HopDoiGiaiDoan
        yeuCau={yeuCau}
        lyDoThua={lyDoThua}
        dong={() => datYeuCau(null)}
        xong={() => {
          datYeuCau(null);
          router.refresh();
        }}
      />
    </>
  );
}
