"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

interface Nguoi {
  id: string;
  hoTen: string;
  email: string;
  daBat: boolean;
  batLuc: string | null;
  maKhoiPhucCon: number;
  vaiTro: string[];
  batBuoc: boolean;
}

export default function QuanTri2Lop({
  chinhSach,
  vaiTro,
  nguoi,
  coKhoaMaHoa,
  duocSuaChinhSach,
  duocDatLai,
  toi,
}: {
  chinhSach: string[];
  vaiTro: { ma: string; ten: string }[];
  nguoi: Nguoi[];
  coKhoaMaHoa: boolean;
  duocSuaChinhSach: boolean;
  duocDatLai: boolean;
  toi: string;
}) {
  const router = useRouter();
  const cs = useGoiApi();
  const dl = useGoiApi();
  const [chon, datChon] = useState<string[]>(chinhSach);
  const [daLuu, datDaLuu] = useState(false);
  const [dangDatLai, datDangDatLai] = useState<Nguoi | null>(null);
  const [lyDo, datLyDo] = useState("");
  const hop = useRef<HTMLDialogElement | null>(null);
  const doi = chon.slice().sort().join(",") !== chinhSach.slice().sort().join(",");

  async function luu() {
    const kq = await cs.goi("/api/v1/xac-thuc-2-lop", "PUT", { vaiTro: chon });
    if (kq) {
      datDaLuu(true);
      router.refresh();
    }
  }
  async function datLai() {
    if (!dangDatLai) return;
    const kq = await dl.goi(`/api/v1/nguoi-dung/${dangDatLai.id}/dat-lai-2-lop`, "POST", { lyDo });
    if (kq) {
      hop.current?.close();
      router.refresh();
    }
  }

  const soBat = nguoi.filter((n) => n.daBat).length;
  const soThieu = nguoi.filter((n) => n.batBuoc && !n.daBat).length;

  return (
    <>
      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Đã bật</div>
          <div className="gia-tri">
            {soBat}/{nguoi.length}
          </div>
          <div className="ghi-chu">người dùng đang hoạt động</div>
        </div>
        <div className={`the chi-so ${soThieu ? "canh-bao" : ""}`}>
          <div className="nhan">Bị bắt mà chưa bật</div>
          <div className="gia-tri">{soThieu}</div>
          <div className="ghi-chu">lần đăng nhập tới sẽ phải bật trước khi vào</div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Vai trò bắt buộc 2 lớp</h2>
        </div>
        <div className="than">
          {!coKhoaMaHoa && (
            <div className="hop-thong-bao canh-bao" role="status">
              Máy chủ chưa đặt APP_ENC_KEY — chưa ai bật được 2 lớp. Đừng bắt buộc trước khi đặt khóa.
            </div>
          )}
          <p className="phu">
            {chinhSach.length === 0 ? "Chưa đặt — không vai trò nào bị bắt buộc (mặc định)." : "Người có một trong các vai trò được chọn phải bật 2 lớp mới vào được hệ thống."}
          </p>
          {cs.loi && (
            <div className="hop-thong-bao loi" role="alert">
              {cs.loi.thongBao}
            </div>
          )}
          {daLuu && !doi && (
            <div className="hop-thong-bao tot" role="status">
              Đã lưu.
            </div>
          )}
          <div className="chuoi-lua-chon" style={{ gap: "8px 20px" }}>
            {vaiTro.map((v) => (
              <label key={v.ma} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  disabled={!duocSuaChinhSach}
                  checked={chon.includes(v.ma)}
                  onChange={(e) => {
                    datDaLuu(false);
                    datChon((c) => (e.target.checked ? [...c, v.ma] : c.filter((x) => x !== v.ma)));
                  }}
                />
                {v.ten}
              </label>
            ))}
          </div>
          {duocSuaChinhSach && (
            <div className="chan-form" style={{ padding: "12px 0 0" }}>
              <button type="button" className="nut chinh" disabled={!doi || cs.dangGui} onClick={luu}>
                Lưu chính sách
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="the">
        <div className="dau">
          <h2>Người dùng</h2>
        </div>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th className="an-tren-dt">Vai trò</th>
                <th>2 lớp</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {nguoi.map((n) => (
                <tr key={n.id}>
                  <td>
                    <strong>{n.hoTen}</strong>
                    <div className="dong-phu">{n.email}</div>
                  </td>
                  <td className="an-tren-dt nho">{n.vaiTro.join(", ")}</td>
                  <td>
                    {n.daBat ? (
                      <>
                        <span className="huy-hieu tot">Đã bật</span>
                        <div className="dong-phu">
                          {dinhDangNgayGio(n.batLuc)} · còn {n.maKhoiPhucCon} mã khôi phục
                        </div>
                      </>
                    ) : (
                      <span className={`huy-hieu ${n.batBuoc ? "canh-bao" : ""}`}>{n.batBuoc ? "Chưa bật — bắt buộc" : "Chưa bật"}</span>
                    )}
                  </td>
                  <td className="so">
                    {duocDatLai && n.daBat && n.id !== toi && (
                      <button
                        type="button"
                        className="nut trong nho"
                        onClick={() => {
                          dl.datLoi(null);
                          datLyDo("");
                          datDangDatLai(n);
                          hop.current?.showModal();
                        }}
                      >
                        Đặt lại
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <HopThoai ref={hop} tieuDe={`Đặt lại 2 lớp — ${dangDatLai?.hoTen ?? ""}`} rong={520}>
        <div className="than">
          <p className="phu">
            Xóa khóa và mã khôi phục của người này, đăng xuất họ khỏi mọi máy. Lần đăng nhập tới họ vào bằng mật khẩu
            {dangDatLai?.batBuoc ? " rồi phải bật lại 2 lớp ngay" : ""}. Chỉ làm khi đã xác minh đúng người (gọi điện, gặp trực tiếp).
          </p>
          {dl.loi && (
            <div className="hop-thong-bao loi" role="alert">
              {dl.loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="dl-ly-do">Lý do</label>
            <input id="dl-ly-do" value={lyDo} onChange={(e) => datLyDo(e.target.value)} placeholder="Mất điện thoại, đổi máy…" />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut trong" onClick={() => hop.current?.close()}>
            Thôi
          </button>
          <button type="button" className="nut chinh" disabled={dl.dangGui || lyDo.trim().length < 2} onClick={datLai}>
            Đặt lại
          </button>
        </div>
      </HopThoai>
    </>
  );
}
