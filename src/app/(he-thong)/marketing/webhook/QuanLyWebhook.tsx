"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import MaNhung from "../form/MaNhung";

/** "a, b ,c" → ["a","b","c"] (bỏ ô trống). */
function tachDs(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const GOI_Y_GIA_TRI = "true, 1, yes, có, đồng ý";

/** Hai ô khai trường / giá trị đồng ý nhận email quảng cáo (EG-08). */
function OTruongDongY({ truong, giaTri, doi }: { truong: string; giaTri: string; doi: (k: "truong" | "giaTri", v: string) => void }) {
  return (
    <>
      <div className="truong">
        <label htmlFor="wh-dy-truong">Trường đồng ý nhận email quảng cáo</label>
        <input id="wh-dy-truong" type="text" value={truong} onChange={(e) => doi("truong", e.target.value)} placeholder="vd: dong_y_email (bỏ trống = nguồn này không mang đồng ý)" />
        <span className="goi-y">
          Tên trường trong thân JSON (đúng chữ hoa / thường, nhiều trường cách nhau dấu phẩy, tối đa 5). Chỉ khi thân có trường này với giá trị chấp nhận, lead mới được ghi
          “đồng ý” vào Sổ đồng ý email. Bỏ trống: lead vẫn vào, nhưng không được gửi thư quảng cáo cho tới khi có căn cứ đồng ý.
        </span>
      </div>
      <div className="truong">
        <label htmlFor="wh-dy-gia-tri">Giá trị được coi là đồng ý</label>
        <input id="wh-dy-gia-tri" type="text" value={giaTri} onChange={(e) => doi("giaTri", e.target.value)} placeholder={`bỏ trống = ${GOI_Y_GIA_TRI}`} disabled={!truong.trim()} />
        <span className="goi-y">Không phân biệt hoa / thường; tối đa 10 giá trị. Giá trị khác (vd “không”, false) → không ghi đồng ý.</span>
      </div>
    </>
  );
}

interface KhoaMoi {
  ma: string;
  khoa: string;
}

function HienKhoa({ duongDan, k, dong }: { duongDan: string; k: KhoaMoi; dong: () => void }) {
  const url = `${duongDan}/${k.ma}`;
  return (
    <div className="than">
      <div className="hop-thong-bao canh-bao" role="alert">
        Chép khóa này ngay. Hệ thống chỉ giữ bản băm — đóng hộp này là không xem lại được nữa. Mất khóa thì bấm “Đổi khóa”.
      </div>
      <MaNhung nhan="Khóa bí mật (gửi trong tiêu đề X-Cowork-Key)" ma={k.khoa} />
      <MaNhung nhan="Địa chỉ nhận (POST, JSON)" ma={url} />
      <MaNhung
        nhan="Ví dụ gọi thử"
        ma={`curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Cowork-Key: ${k.khoa}' \\\n  -d '{"full_name":"Nguyễn Văn A","phone_number":"0909123456","email":"a@vidu.vn","message":"Cần báo giá camera"}'`}
      />
      <button type="button" className="nut chinh" onClick={dong}>
        Tôi đã chép khóa
      </button>
    </div>
  );
}

/** Tạo nguồn webhook (khóa hiện một lần), đổi khóa, thu hồi (MK-12). */
export function NutTaoWebhook({ duongDan, chienDich, nguon }: { duongDan: string; chienDich: { id: string; ma: string; ten: string }[]; nguon: { ma: string; ten: string }[] }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState({ ten: "", ma: "", chienDichId: "", nguon: "facebook", truong: "", giaTri: "" });
  const [moi, datMoi] = useState<KhoaMoi | null>(null);

  async function tao(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ nguon: { ma: string }; khoa: string }>("/api/v1/marketing/webhook", "POST", {
      ten: gt.ten, ma: gt.ma || null, chienDichId: gt.chienDichId || null, nguon: gt.nguon || null,
      truongDongY: tachDs(gt.truong), giaTriDongY: tachDs(gt.giaTri),
    });
    if (kq) datMoi({ ma: kq.nguon.ma, khoa: kq.khoa });
  }

  return (
    <>
      <button type="button" className="nut chinh" onClick={() => { datMoi(null); hop.current?.showModal(); }}>
        Tạo nguồn webhook
      </button>
      <HopThoai ref={hop} tieuDe="Nguồn webhook mới" rong={640} khiDong={() => { if (moi) router.refresh(); }}>
        {moi ? (
          <HienKhoa duongDan={duongDan} k={moi} dong={() => hop.current?.close()} />
        ) : (
          <form onSubmit={tao}>
            <div className="than">
              {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
              <div className="truong">
                <label htmlFor="wh-ten">Tên nguồn</label>
                <input id="wh-ten" type="text" value={gt.ten} onChange={(e) => datGt((c) => ({ ...c, ten: e.target.value }))} placeholder="vd: Facebook Lead Ads qua Zapier" />
                {loiCua(loi, "ten") && <span className="loi-truong">{loiCua(loi, "ten")}</span>}
              </div>
              <div className="truong">
                <label htmlFor="wh-ma">Mã trên đường dẫn</label>
                <input id="wh-ma" type="text" value={gt.ma} onChange={(e) => datGt((c) => ({ ...c, ma: e.target.value }))} placeholder="bỏ trống để tự tạo từ tên" />
                {loiCua(loi, "ma") && <span className="loi-truong">{loiCua(loi, "ma")}</span>}
              </div>
              <div className="truong">
                <label htmlFor="wh-cd">Chiến dịch</label>
                <select id="wh-cd" value={gt.chienDichId} onChange={(e) => datGt((c) => ({ ...c, chienDichId: e.target.value }))}>
                  <option value="">— Không gắn —</option>
                  {chienDich.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ma} — {c.ten}
                    </option>
                  ))}
                </select>
              </div>
              <div className="truong">
                <label htmlFor="wh-ng">Nguồn lead</label>
                <select id="wh-ng" value={gt.nguon} onChange={(e) => datGt((c) => ({ ...c, nguon: e.target.value }))}>
                  <option value="">— Chưa chọn —</option>
                  {nguon.map((n) => (
                    <option key={n.ma} value={n.ma}>
                      {n.ten}
                    </option>
                  ))}
                </select>
              </div>
              <OTruongDongY truong={gt.truong} giaTri={gt.giaTri} doi={(k, v) => datGt((c) => ({ ...c, [k]: v }))} />
            </div>
            <div className="chan-form">
              <button type="submit" className="nut chinh" disabled={dangGui || gt.ten.trim().length < 3}>
                Tạo và lấy khóa
              </button>
            </div>
          </form>
        )}
      </HopThoai>
    </>
  );
}

export function TacVuWebhook({ id, ma, duongDan, truongDongY, giaTriDongY }: { id: string; ma: string; duongDan: string; truongDongY: string[]; giaTriDongY: string[] }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const hopDongY = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi } = useGoiApi();
  const [moi, datMoi] = useState<KhoaMoi | null>(null);
  const [dy, datDy] = useState({ truong: truongDongY.join(", "), giaTri: giaTriDongY.join(", ") });
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        className="nut nho"
        onClick={() => {
          datDy({ truong: truongDongY.join(", "), giaTri: giaTriDongY.join(", ") });
          hopDongY.current?.showModal();
        }}
      >
        Đồng ý email
      </button>
      <button
        type="button"
        className="nut nho"
        disabled={dangGui}
        onClick={async () => {
          if (!window.confirm("Đổi khóa? Khóa cũ hết hiệu lực ngay — phải cập nhật bên gửi.")) return;
          const kq = await goi<{ khoa: string }>(`/api/v1/marketing/webhook/${id}/doi-khoa`, "POST");
          if (kq) {
            datMoi({ ma, khoa: kq.khoa });
            hop.current?.showModal();
          }
        }}
      >
        Đổi khóa
      </button>
      <button
        type="button"
        className="nut nho nguy-hiem"
        disabled={dangGui}
        onClick={async () => {
          if (!window.confirm("Thu hồi nguồn này? Mọi lần gửi sau đó bị từ chối.")) return;
          if (await goi(`/api/v1/marketing/webhook/${id}/thu-hoi`, "POST")) router.refresh();
        }}
      >
        Thu hồi
      </button>
      {loi && <span className="loi-truong">{loi.thongBao}</span>}
      <HopThoai ref={hopDongY} tieuDe="Đồng ý nhận email quảng cáo" rong={640}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await goi(`/api/v1/marketing/webhook/${id}/dong-y`, "POST", { truongDongY: tachDs(dy.truong), giaTriDongY: tachDs(dy.giaTri) })) {
              hopDongY.current?.close();
              router.refresh();
            }
          }}
        >
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <OTruongDongY truong={dy.truong} giaTri={dy.giaTri} doi={(k, v) => datDy((c) => ({ ...c, [k]: v }))} />
            <p className="phu">Chỉ áp cho lead nhận sau khi lưu. Đồng ý đã ghi trước đó không đổi.</p>
          </div>
          <div className="chan-form">
            <button type="submit" className="nut chinh" disabled={dangGui}>
              Lưu
            </button>
          </div>
        </form>
      </HopThoai>
      <HopThoai ref={hop} tieuDe="Khóa mới" rong={640} khiDong={() => router.refresh()}>
        {moi && <HienKhoa duongDan={duongDan} k={moi} dong={() => hop.current?.close()} />}
      </HopThoai>
    </span>
  );
}
