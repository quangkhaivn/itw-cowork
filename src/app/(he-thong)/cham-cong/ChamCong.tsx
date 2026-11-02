"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

type LanCham = {
  id: string; luc: string; nguon: string; huong: string | null; ketQuaGps: string | null; co: string[]; canXemXet: boolean;
  quyetDinh: string | null; tinhCong: boolean; noi: string | null; khoangCachM: number | null; banDo: string | null;
};
type DuLieu = {
  daXacNhanViTri: boolean;
  phienBanThongBao: string;
  homNay: { ngay: string; loaiNgay: string; phan: string; gioVao: string | null; gioRa: string | null; coLich: boolean; nghi: { phan: string } | null; trangThai: string; soLanCham: number };
  ganDay: LanCham[];
};

const NHAN_TRANG_THAI: Record<string, string> = {
  "nghi-phep": "Nghỉ phép", "hien-truong": "Đang ở hiện trường", "da-ra-ca": "Đã ra ca", "di-muon": "Đã vào ca (muộn)", "da-vao-ca": "Đã vào ca",
  "chua-den": "Chưa chấm vào ca", "chua-toi-gio": "Chưa tới giờ vào ca", "khong-co-ca": "Hôm nay không có ca",
};
const NHAN_NGUON: Record<string, string> = { "van-tay": "Máy vân tay", gps: "GPS", "bo-sung": "Chấm bù", "nhap-csv": "Nhập tệp" };
const NHAN_KQ: Record<string, { nhan: string; lop: string }> = {
  "hop-le": { nhan: "Trong vùng", lop: "tot" }, "hien-truong": { nhan: "Hiện trường", lop: "chinh" }, "ngoai-vung": { nhan: "Ngoài vùng", lop: "canh-bao" },
};
const NHAN_CO: Record<string, string> = {
  "do-chinh-xac-thap": "GPS kém chính xác", "toc-do-bat-thuong": "Tốc độ bất thường", "thieu-quyen-vi-tri": "Không lấy được vị trí", "gio-may-lech": "Giờ máy lệch",
  "gio-may-vo-ly": "Giờ máy vô lý", "phieu-hien-truong-cu": "Phiếu hỗ trợ không còn hoạt động gần đây", "phieu-da-xong": "Phiếu hỗ trợ đã xong",
};
const gio = (s: string) => new Date(s).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const ngayGio = (s: string) => new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/** Mã lỗi Geolocation → mã gửi máy chủ (NS-12: không lấy được vị trí vẫn ghi, gắn cờ). */
function loiViTri(e: GeolocationPositionError | null): "tu-choi" | "khong-ho-tro" | "het-gio" | "loi-khac" {
  if (!e) return "khong-ho-tro";
  return e.code === 1 ? "tu-choi" : e.code === 3 ? "het-gio" : "loi-khac";
}

export default function ChamCong({ duLieu }: { duLieu: DuLieu }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [bayGio, datBayGio] = useState<Date | null>(null);
  const [dangLayViTri, datDangLayViTri] = useState(false);
  const [ketQua, datKetQua] = useState<{ lop: string; chu: string } | null>(null);
  const [anToan, datAnToan] = useState(true);

  useEffect(() => {
    // Đồng hồ và kiểm HTTPS chỉ chạy ở trình duyệt (tránh lệch giữa bản dựng máy chủ và máy khách).
    const dau = setTimeout(() => {
      datBayGio(new Date());
      datAnToan(window.isSecureContext);
    }, 0);
    const t = setInterval(() => datBayGio(new Date()), 1000);
    return () => {
      clearTimeout(dau);
      clearInterval(t);
    };
  }, []);

  async function xacNhan() {
    if (await goi("/api/v1/cham-cong/xac-nhan-vi-tri", "POST", { phienBan: duLieu.phienBanThongBao })) router.refresh();
  }

  async function gui(huong: "vao" | "ra", viTri: GeolocationPosition | null, loiVt: GeolocationPositionError | null) {
    const than = viTri
      ? { huong, viDo: viTri.coords.latitude, kinhDo: viTri.coords.longitude, doChinhXacM: viTri.coords.accuracy, gioMay: new Date().toISOString() }
      : { huong, loiViTri: loiViTri(loiVt), gioMay: new Date().toISOString() };
    const kq = await goi<{ ketQua: string; trungLap: boolean; co: string[]; diaDiem: { ten: string; khoangCachM: number } | null; phieu: { so: string } | null; luc: string }>(
      "/api/v1/cham-cong/gps", "POST", than,
    );
    datDangLayViTri(false);
    if (!kq) return;
    if (kq.trungLap) {
      datKetQua({ lop: "thong-tin", chu: `Đã ghi nhận từ lúc ${gio(kq.luc)} — không ghi thêm lần bấm trùng.` });
    } else {
      const nhan = NHAN_KQ[kq.ketQua]?.nhan ?? kq.ketQua;
      const them = [
        kq.diaDiem ? `${kq.diaDiem.ten}, cách ${kq.diaDiem.khoangCachM.toLocaleString("vi-VN")} m` : null,
        kq.phieu ? `phiếu ${kq.phieu.so}` : null,
        ...kq.co.map((c) => NHAN_CO[c] ?? c),
      ].filter(Boolean).join(" · ");
      datKetQua({
        lop: kq.ketQua === "hop-le" && kq.co.length === 0 ? "tot" : "canh-bao",
        chu: `${huong === "vao" ? "Vào ca" : "Ra ca"} lúc ${gio(kq.luc)} — ${nhan}${them ? ` (${them})` : ""}.${kq.ketQua !== "hop-le" || kq.co.length ? " Quản lý sẽ xem lại lần chấm này." : ""}`,
      });
    }
    router.refresh();
  }

  function bam(huong: "vao" | "ra") {
    datKetQua(null);
    if (!("geolocation" in navigator)) {
      void gui(huong, null, null);
      return;
    }
    datDangLayViTri(true);
    navigator.geolocation.getCurrentPosition(
      (vt) => void gui(huong, vt, null),
      (e) => void gui(huong, null, e),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const h = duLieu.homNay;
  if (!duLieu.daXacNhanViTri) {
    return (
      <section className="the" style={{ maxWidth: 640 }}>
        <h2 style={{ marginTop: 0 }}>Thông báo về dữ liệu vị trí</h2>
        <p>Trước khi chấm công bằng điện thoại lần đầu, vui lòng đọc:</p>
        <ul>
          <li>Cowork chỉ lấy vị trí của điện thoại <strong>đúng lúc bạn bấm</strong> Vào ca / Ra ca. Không theo dõi liên tục, không lấy vị trí khi bạn không bấm.</li>
          <li>Được lưu: toạ độ, độ chính xác, giờ bấm (giờ máy chủ), địa chỉ IP, loại trình duyệt — chỉ để xác nhận chấm công.</li>
          <li>Người xem được: chính bạn, quản lý trực tiếp, bộ phận Nhân sự và Ban giám đốc. Không dùng cho mục đích khác.</li>
          <li>Không muốn chia sẻ vị trí: bạn vẫn chấm được bằng máy vân tay; bấm trên điện thoại mà không cho vị trí thì lần chấm được ghi là <em>ngoài vùng</em> và chờ quản lý xem xét.</li>
          <li>Căn cứ: Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15. Bạn có quyền xem, yêu cầu đính chính dữ liệu chấm công của mình qua bộ phận Nhân sự.</li>
        </ul>
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        <button type="button" className="nut chinh" onClick={xacNhan} disabled={dangGui}>
          {dangGui ? "Đang ghi…" : "Tôi đã đọc và đồng ý"}
        </button>
        <p className="phu nho">Phiên bản thông báo: {duLieu.phienBanThongBao}. Lần xác nhận được lưu lại (không sửa, không xóa).</p>
      </section>
    );
  }

  return (
    <>
      <section className="the" style={{ maxWidth: 640 }}>
        <div className="cham-cong-gio" suppressHydrationWarning>
          {bayGio ? bayGio.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—"}
        </div>
        <div className="phu">
          {h.coLich
            ? h.gioVao
              ? `Ca hôm nay: ${h.gioVao} – ${h.gioRa}${h.phan !== "ca" ? " (nửa ngày)" : ""}`
              : h.loaiNgay === "le" ? "Hôm nay là ngày lễ" : "Hôm nay là ngày nghỉ"
            : "Bạn chưa được gán lịch làm — báo bộ phận Nhân sự."}
          {h.nghi && " · có nghỉ phép đã duyệt"}
        </div>
        <div style={{ marginTop: 6 }}>
          <span className="huy-hieu chinh">{NHAN_TRANG_THAI[h.trangThai] ?? h.trangThai}</span>
          {h.soLanCham > 0 && <span className="phu nho"> · {h.soLanCham} lần chấm hôm nay</span>}
        </div>

        {!anToan && (
          <div className="hop-thong-bao canh-bao" role="alert" style={{ marginTop: 12 }}>
            Trang đang mở qua kết nối không bảo mật (không phải HTTPS) nên trình duyệt sẽ không cho lấy vị trí. Mở Cowork bằng địa chỉ https://.
          </div>
        )}
        <div className="cham-cong-nut">
          <button type="button" className="nut chinh" onClick={() => bam("vao")} disabled={dangGui || dangLayViTri}>
            Vào ca <small>{dangLayViTri ? "Đang lấy vị trí…" : "Bắt đầu làm"}</small>
          </button>
          <button type="button" className="nut ra" onClick={() => bam("ra")} disabled={dangGui || dangLayViTri}>
            Ra ca <small>{dangLayViTri ? "Đang lấy vị trí…" : "Kết thúc"}</small>
          </button>
        </div>
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        {ketQua && <div className={`hop-thong-bao ${ketQua.lop}`} role="status">{ketQua.chu}</div>}
        <p className="phu nho">Lần đầu bấm, điện thoại sẽ hỏi quyền vị trí — chọn &quot;Cho phép&quot;. Giờ chấm lấy theo máy chủ, không theo đồng hồ điện thoại.</p>
      </section>

      <section className="the" style={{ maxWidth: 640 }}>
        <div className="dau"><h2>14 ngày gần đây</h2></div>
        {duLieu.ganDay.length === 0 ? (
          <p className="phu">Chưa có lần chấm nào.</p>
        ) : (
          <ul className="ds-lan-cham">
            {duLieu.ganDay.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{ngayGio(p.luc)}</strong> · {NHAN_NGUON[p.nguon] ?? p.nguon}
                  {p.huong && ` · ${p.huong === "vao" ? "vào" : "ra"}`}
                  {p.noi && <span className="phu"> · {p.noi}</span>}
                </span>
                <span>
                  {p.ketQuaGps && <span className={`huy-hieu ${NHAN_KQ[p.ketQuaGps]?.lop ?? ""}`}>{NHAN_KQ[p.ketQuaGps]?.nhan ?? p.ketQuaGps}</span>}{" "}
                  {p.co.map((c) => <span key={c} className="huy-hieu canh-bao">{NHAN_CO[c] ?? c}</span>)}{" "}
                  {p.quyetDinh === "tu-choi" && <span className="huy-hieu loi">Không được chấp nhận</span>}
                  {p.quyetDinh === "chap-nhan" && <span className="huy-hieu tot">Đã chấp nhận</span>}
                  {!p.quyetDinh && p.canXemXet && <span className="huy-hieu">{p.tinhCong ? "Chờ xem xét" : "Chờ xem xét — chưa tính công"}</span>}{" "}
                  {p.banDo && <a href={p.banDo} target="_blank" rel="noopener noreferrer">Xem trên bản đồ</a>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
