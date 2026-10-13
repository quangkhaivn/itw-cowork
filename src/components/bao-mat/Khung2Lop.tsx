"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

export interface TrangThai2Lop {
  daBat: boolean;
  batLuc: string | null;
  soMaKhoiPhucCon: number;
  batBuoc: boolean;
  coKhoaMaHoa: boolean;
}

/**
 * Bật / tắt xác thực 2 lớp của chính mình (XT-01 → XT-03, XT-07).
 * Dùng chung cho mục "Tài khoản của tôi" và trang bắt buộc bật 2 lớp.
 *
 * Khóa bí mật chỉ hiện **một lần** lúc bật, dạng chữ + URI otpauth để dán vào ứng dụng
 * (chưa có mã QR — QĐ-72). Mã khôi phục cũng chỉ hiện một lần, ngay sau khi bật.
 */
export default function Khung2Lop({ trangThai, sauKhiBat }: { trangThai: TrangThai2Lop; sauKhiBat?: string }) {
  const router = useRouter();
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [khoa, datKhoa] = useState<{ khoaNhom: string; uri: string } | null>(null);
  const [ma, datMa] = useState("");
  const [matKhau, datMatKhau] = useState("");
  const [maKhoiPhuc, datMaKhoiPhuc] = useState<string[] | null>(null);
  const [che, datChe] = useState<"" | "tat" | "sinh-lai">("");

  async function batDau() {
    const kq = await goi<{ khoaNhom: string; uri: string }>("/api/v1/tai-khoan/2-lop/bat-dau", "POST");
    if (kq) {
      datKhoa(kq);
      datMa("");
    }
  }
  async function xacNhan(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ maKhoiPhuc: string[] }>("/api/v1/tai-khoan/2-lop/xac-nhan", "POST", { ma });
    if (kq) {
      datKhoa(null);
      datMaKhoiPhuc(kq.maKhoiPhuc);
    }
  }
  async function tat(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi("/api/v1/tai-khoan/2-lop/tat", "POST", { matKhau, ma });
    if (kq) {
      datChe("");
      datMa("");
      datMatKhau("");
      router.refresh();
    }
  }
  async function sinhLai(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ maKhoiPhuc: string[] }>("/api/v1/tai-khoan/2-lop/ma-khoi-phuc", "POST", { ma });
    if (kq) {
      datChe("");
      datMa("");
      datMaKhoiPhuc(kq.maKhoiPhuc);
    }
  }

  if (maKhoiPhuc) {
    return (
      <div>
        <div className="hop-thong-bao tot" role="status">
          Đã bật / cập nhật xác thực 2 lớp. Chép 10 mã khôi phục dưới đây và cất ở nơi an toàn — mỗi mã đăng nhập được một lần khi mất điện thoại. Mã chỉ hiện lần này.
        </div>
        <ol className="ds-ma-khoi-phuc" aria-label="Mã khôi phục">
          {maKhoiPhuc.map((m) => (
            <li key={m}>
              <code>{m}</code>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="nut chinh"
          onClick={() => {
            datMaKhoiPhuc(null);
            if (sauKhiBat) router.push(sauKhiBat);
            router.refresh();
          }}
        >
          Tôi đã cất mã khôi phục
        </button>
      </div>
    );
  }

  return (
    <div>
      {loi && (
        <div className="hop-thong-bao loi" role="alert">
          {loi.thongBao}
        </div>
      )}
      {!trangThai.coKhoaMaHoa && !trangThai.daBat && (
        <div className="hop-thong-bao canh-bao" role="status">
          Máy chủ chưa đặt khóa mã hóa APP_ENC_KEY nên chưa bật được xác thực 2 lớp. Báo quản trị máy chủ.
        </div>
      )}

      {trangThai.daBat ? (
        <>
          <p>
            <span className="huy-hieu tot">Đang bật</span> từ {dinhDangNgayGio(trangThai.batLuc)} · còn {trangThai.soMaKhoiPhucCon} mã khôi phục chưa dùng
            {trangThai.batBuoc && <span className="huy-hieu canh-bao" style={{ marginLeft: 6 }}>Bắt buộc theo vai trò</span>}
          </p>
          {che === "" && (
            <div className="chuoi-lua-chon" style={{ gap: 8 }}>
              <button type="button" className="nut" onClick={() => (datLoi(null), datChe("sinh-lai"))}>
                Sinh lại mã khôi phục
              </button>
              {!trangThai.batBuoc && (
                <button type="button" className="nut trong" onClick={() => (datLoi(null), datChe("tat"))}>
                  Tắt xác thực 2 lớp
                </button>
              )}
            </div>
          )}
          {che === "sinh-lai" && (
            <form onSubmit={sinhLai} className="luoi-form">
              <div className="truong">
                <label htmlFor="hai-lop-ma-sl">Mã 6 số đang hiện trên điện thoại</label>
                <input type="text" id="hai-lop-ma-sl" inputMode="numeric" autoComplete="one-time-code" value={ma} onChange={(e) => datMa(e.target.value)} required />
              </div>
              <div className="chan-form">
                <button type="button" className="nut trong" onClick={() => datChe("")}>Thôi</button>
                <button type="submit" className="nut chinh" disabled={dangGui}>Sinh lại</button>
              </div>
            </form>
          )}
          {che === "tat" && (
            <form onSubmit={tat} className="luoi-form">
              <div className="truong">
                <label htmlFor="hai-lop-mk">Mật khẩu hiện tại</label>
                <input id="hai-lop-mk" type="password" autoComplete="current-password" value={matKhau} onChange={(e) => datMatKhau(e.target.value)} required />
              </div>
              <div className="truong">
                <label htmlFor="hai-lop-ma-tat">Mã 6 số hoặc mã khôi phục</label>
                <input type="text" id="hai-lop-ma-tat" autoComplete="one-time-code" value={ma} onChange={(e) => datMa(e.target.value)} required />
              </div>
              <div className="chan-form">
                <button type="button" className="nut trong" onClick={() => datChe("")}>Thôi</button>
                <button type="submit" className="nut chinh" disabled={dangGui}>Tắt 2 lớp</button>
              </div>
            </form>
          )}
        </>
      ) : khoa ? (
        <form onSubmit={xacNhan}>
          <ol className="buoc-2-lop">
            <li>Mở ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft Authenticator, Authy…) và chọn <strong>Nhập khóa thiết lập</strong>.</li>
            <li>
              Nhập khóa: <code className="khoa-2-lop">{khoa.khoaNhom}</code> — loại <strong>theo thời gian</strong>. Hoặc dán nguyên chuỗi dưới đây vào ứng dụng hỗ trợ URI:
              <textarea readOnly rows={3} value={khoa.uri} className="uri-2-lop" onFocus={(e) => e.currentTarget.select()} aria-label="URI otpauth" />
            </li>
            <li>Nhập mã 6 số ứng dụng đang hiện để xác nhận.</li>
          </ol>
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="hai-lop-ma">Mã 6 số</label>
              <input type="text" id="hai-lop-ma" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={ma} onChange={(e) => datMa(e.target.value)} required autoFocus />
            </div>
          </div>
          <div className="chan-form">
            <button type="submit" className="nut chinh" disabled={dangGui}>
              {dangGui ? "Đang kiểm…" : "Xác nhận và bật"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="phu">
            Chưa bật. Khi bật, đăng nhập cần thêm mã 6 số từ ứng dụng xác thực trên điện thoại — lộ mật khẩu cũng chưa vào được tài khoản.
          </p>
          <button type="button" className="nut chinh" onClick={batDau} disabled={dangGui || !trangThai.coKhoaMaHoa}>
            Bật xác thực 2 lớp
          </button>
        </>
      )}
    </div>
  );
}
