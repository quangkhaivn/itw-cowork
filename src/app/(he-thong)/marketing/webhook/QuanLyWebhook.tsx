"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import MaNhung from "../form/MaNhung";

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
  const [gt, datGt] = useState({ ten: "", ma: "", chienDichId: "", nguon: "facebook" });
  const [moi, datMoi] = useState<KhoaMoi | null>(null);

  async function tao(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ nguon: { ma: string }; khoa: string }>("/api/v1/marketing/webhook", "POST", {
      ten: gt.ten, ma: gt.ma || null, chienDichId: gt.chienDichId || null, nguon: gt.nguon || null,
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

export function TacVuWebhook({ id, ma, duongDan }: { id: string; ma: string; duongDan: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi } = useGoiApi();
  const [moi, datMoi] = useState<KhoaMoi | null>(null);
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
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
      <HopThoai ref={hop} tieuDe="Khóa mới" rong={640} khiDong={() => router.refresh()}>
        {moi && <HienKhoa duongDan={duongDan} k={moi} dong={() => hop.current?.close()} />}
      </HopThoai>
    </span>
  );
}
