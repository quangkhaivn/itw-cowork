"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

interface DeXuat {
  id: string;
  loai: string;
  tomTat: string;
  trangThai: string;
  doiTuong: string | null;
  doiTuongId: string | null;
  lyDoTuChoi: string | null;
  loi: string | null;
}

interface TinNhan {
  id: string;
  vaiTro: string;
  noiDung: string;
  soVong: number;
  loi: string | null;
  luc: string;
  congCu: { ten: string; ketCuc: string; mili: number }[];
}

const NHAN_KET_CUC: Record<string, string> = {
  ok: "ok",
  "thieu-quyen": "thiếu quyền",
  "tham-so-sai": "tham số sai",
  loi: "lỗi",
};

const DUONG_DAN_DOI_TUONG: Record<string, string> = {
  quotation: "/ban-hang/bao-gia",
  task: "/cong-viec",
};

/**
 * Khung chat với trợ lý ITA.
 *
 * Hai điều giao diện phải nói thật:
 *  - **Trợ lý đã tra bằng công cụ nào** — hiện ngay dưới mỗi câu trả lời, để người đọc
 *    biết con số lấy từ đâu chứ không phải tin suông.
 *  - **Đề xuất chưa chạy** — thẻ đề xuất nằm riêng, có nút Đồng ý và Từ chối. Không có
 *    đường nào để trợ lý tự bấm.
 */
export default function KhungChat({
  hoiThoaiId,
  tinNhanBanDau,
  deXuatBanDau,
  daCauHinh,
  lyDoChuaCauHinh,
}: {
  hoiThoaiId: string | null;
  tinNhanBanDau: TinNhan[];
  deXuatBanDau: DeXuat[];
  daCauHinh: boolean;
  lyDoChuaCauHinh: string;
}) {
  const router = useRouter();
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [cauHoi, datCauHoi] = useState("");
  const [tin, datTin] = useState<TinNhan[]>(tinNhanBanDau);
  const [deXuat, datDeXuat] = useState<DeXuat[]>(deXuatBanDau);
  const [idHoiThoai, datIdHoiThoai] = useState<string | null>(hoiThoaiId);
  const cuoi = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    cuoi.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [tin.length]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const hoi = cauHoi.trim();
    if (hoi.length < 2) return;
    datLoi(null);
    datCauHoi("");
    // Hiện ngay câu của mình để khung chat không đứng im trong lúc chờ.
    datTin((c) => [
      ...c,
      { id: `tam-${Date.now()}`, vaiTro: "nguoi-dung", noiDung: hoi, soVong: 0, loi: null, luc: new Date().toISOString(), congCu: [] },
    ]);

    const kq = await goi<{ hoiThoaiId: string }>("/api/v1/tro-ly/hoi", "POST", {
      hoiThoaiId: idHoiThoai ?? "",
      cauHoi: hoi,
    });
    if (!kq) {
      // Gọi hỏng: bỏ câu vừa hiện tạm, giữ lại chữ để người dùng sửa và gửi lại.
      datTin((c) => c.filter((t) => !t.id.startsWith("tam-")));
      datCauHoi(hoi);
      return;
    }
    datIdHoiThoai(kq.hoiThoaiId);
    await lamMoi(kq.hoiThoaiId);
    router.refresh();
  }

  async function lamMoi(id: string) {
    const r = await fetch(`/api/v1/tro-ly/hoi-thoai/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { tinNhan: TinNhan[]; deXuat: DeXuat[] };
    datTin(d.tinNhan ?? []);
    datDeXuat(d.deXuat ?? []);
  }

  async function duyet(id: string) {
    const kq = await goi(`/api/v1/tro-ly/de-xuat/${id}/duyet`, "POST", {});
    if (!kq || !idHoiThoai) return;
    await lamMoi(idHoiThoai);
    router.refresh();
  }

  async function tuChoi(id: string) {
    const lyDo = window.prompt("Vì sao không dùng đề xuất này?");
    if (!lyDo || lyDo.trim().length < 2) return;
    const kq = await goi(`/api/v1/tro-ly/de-xuat/${id}/tu-choi`, "POST", { lyDo });
    if (!kq || !idHoiThoai) return;
    await lamMoi(idHoiThoai);
  }

  const deXuatCho = deXuat.filter((d) => d.trangThai === "de-xuat");
  const deXuatDaXong = deXuat.filter((d) => d.trangThai !== "de-xuat");

  return (
    <section className="the">
      {!daCauHinh && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao canh-bao" role="status">
            <strong>Trợ lý chưa dùng được.</strong> {lyDoChuaCauHinh} Hệ thống cố ý không trả lời khi chưa gọi được
            mô hình — thà nói chưa dùng được còn hơn đưa một câu nghe hợp lý mà sai.
          </div>
        </div>
      )}

      <div className="khung-chat">
        {tin.length === 0 ? (
          <div className="chat-trong">
            <p>Hỏi bằng tiếng Việt, ví dụ:</p>
            <ul>
              <li>&ldquo;Khách nào đang nợ quá hạn nhiều nhất?&rdquo;</li>
              <li>&ldquo;Báo giá nào gửi rồi mà chưa thấy trả lời?&rdquo;</li>
              <li>&ldquo;Còn bao nhiêu laptop trong kho?&rdquo;</li>
              <li>&ldquo;Tạo giúp tôi việc gọi lại khách Hạnh Phúc vào thứ Hai.&rdquo;</li>
            </ul>
            <p className="phu nho">
              Trợ lý chỉ tra được phần bạn có quyền xem, và không tự thay đổi dữ liệu — mọi thay đổi đều chờ bạn bấm.
            </p>
          </div>
        ) : (
          <ul className="ds-chat">
            {tin.map((t) => (
              <li key={t.id} className={t.vaiTro === "nguoi-dung" ? "cua-toi" : "cua-tro-ly"}>
                <div className="bong">
                  <div className="noi-dung">{t.noiDung}</div>
                  {t.congCu.length > 0 && (
                    <div className="dau-vet">
                      Đã tra: {t.congCu.map((c) => `${c.ten}${c.ketCuc === "ok" ? "" : ` (${NHAN_KET_CUC[c.ketCuc] ?? c.ketCuc})`}`).join(", ")}
                    </div>
                  )}
                  {t.loi && <div className="dau-vet chu-loi">Lỗi: {t.loi}</div>}
                </div>
                <div className="gio">{dinhDangNgayGio(t.luc)}</div>
              </li>
            ))}
          </ul>
        )}
        <div ref={cuoi} />
      </div>

      {deXuatCho.length > 0 && (
        <div className="phan-form">
          <h3>Đề xuất chờ bạn quyết</h3>
          <p className="goi-y" style={{ marginTop: 0 }}>
            Trợ lý <strong>chưa</strong> làm gì cả. Bấm Đồng ý thì hệ thống mới chạy, và chạy bằng quyền của bạn.
          </p>
          <ul className="ds-de-xuat">
            {deXuatCho.map((d) => (
              <li key={d.id}>
                <div className="than-viec">
                  <strong>{d.tomTat}</strong>
                  <div className="dong-phu phu">{d.loai}</div>
                  {d.loi && <div className="dong-phu chu-loi">Lần chạy trước hỏng: {d.loi}</div>}
                </div>
                <div className="tac-vu">
                  <button type="button" className="nut chinh nho" onClick={() => duyet(d.id)} disabled={dangGui}>
                    Đồng ý
                  </button>
                  <button type="button" className="nut trong nho" onClick={() => tuChoi(d.id)} disabled={dangGui}>
                    Từ chối
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deXuatDaXong.length > 0 && (
        <div className="phan-form">
          <h3>Đề xuất đã xử lý</h3>
          <ul className="ds-de-xuat">
            {deXuatDaXong.map((d) => (
              <li key={d.id} className="mo">
                <div className="than-viec">
                  <strong>{d.tomTat}</strong>
                  <div className="dong-phu">
                    {d.trangThai === "da-chay" ? (
                      <>
                        Đã chạy
                        {d.doiTuong && d.doiTuongId && DUONG_DAN_DOI_TUONG[d.doiTuong] && (
                          <>
                            {" · "}
                            <Link href={`${DUONG_DAN_DOI_TUONG[d.doiTuong]}/${d.doiTuongId}`}>Xem bản ghi</Link>
                          </>
                        )}
                      </>
                    ) : (
                      `Đã từ chối: ${d.lyDoTuChoi ?? ""}`
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="chan-chat" onSubmit={gui}>
        {loi && (
          <div className="hop-thong-bao loi" role="alert" style={{ marginBottom: 10 }}>
            {loi.thongBao}
          </div>
        )}
        <div className="hang-nhap">
          <input
            type="text"
            value={cauHoi}
            onChange={(e) => datCauHoi(e.target.value)}
            placeholder={daCauHinh ? "Hỏi trợ lý…" : "Trợ lý chưa được cấu hình"}
            disabled={!daCauHinh || dangGui}
            aria-label="Câu hỏi cho trợ lý"
          />
          <button type="submit" className="nut chinh" disabled={!daCauHinh || dangGui || cauHoi.trim().length < 2}>
            {dangGui ? "Đang tra…" : "Gửi"}
          </button>
        </div>
      </form>
    </section>
  );
}
