"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import { kiemTraMatKhauManh, sinhMatKhauTam } from "@/lib/mat-khau";

interface LuaChon {
  phongBan: { id: string; name: string }[];
  nguoi: { id: string; hoTen: string; email: string }[];
  vaiTro: { id: string; code: string; name: string; description: string | null }[];
}

export interface GiaTriBanDau {
  id?: string;
  email: string;
  hoTen: string;
  dienThoai: string;
  maNhanVien: string;
  chucDanh: string;
  phongBanId: string;
  quanLyId: string;
  vaiTroIds: string[];
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const thongBao = loiCua(loi, truong);
  return thongBao ? <span className="loi-truong">{thongBao}</span> : null;
}

/**
 * Form tạo / sửa người dùng. Kiểm tra ở đây chỉ để báo lỗi sớm cho người nhập —
 * máy chủ kiểm lại toàn bộ (lược đồ Zod + bất biến nghiệp vụ trong service).
 */
export default function FormNguoiDung({
  luaChon,
  banDau,
  duocDoiVaiTro,
}: {
  luaChon: LuaChon;
  banDau: GiaTriBanDau;
  duocDoiVaiTro: boolean;
}) {
  const router = useRouter();
  const laTaoMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState(banDau);
  const [matKhau, datMatKhau] = useState("");
  const [batDoi, datBatDoi] = useState(true);
  const [daLuu, datDaLuu] = useState(false);

  const dat = <K extends keyof GiaTriBanDau>(k: K, v: GiaTriBanDau[K]) => {
    datGt((c) => ({ ...c, [k]: v }));
    datDaLuu(false);
  };
  const loiMatKhau = matKhau ? kiemTraMatKhauManh(matKhau, gt.email) : [];

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = {
      hoTen: gt.hoTen,
      dienThoai: gt.dienThoai,
      maNhanVien: gt.maNhanVien,
      chucDanh: gt.chucDanh,
      phongBanId: gt.phongBanId,
      quanLyId: gt.quanLyId,
      ...(duocDoiVaiTro && { vaiTroIds: gt.vaiTroIds }),
    };
    if (laTaoMoi) {
      const kq = await goi<{ id: string }>("/api/v1/nguoi-dung", "POST", {
        ...than,
        email: gt.email,
        vaiTroIds: duocDoiVaiTro ? gt.vaiTroIds : [],
        matKhauKhoiTao: matKhau,
        batDoiMatKhau: batDoi,
      });
      if (kq) router.push(`/quan-tri/nguoi-dung/${kq.id}?moTao=1`);
    } else {
      const kq = await goi(`/api/v1/nguoi-dung/${banDau.id}`, "PATCH", than);
      if (kq) {
        datDaLuu(true);
        router.refresh();
      }
    }
  }

  const aria = (truong: string) => (loiCua(loi, truong) ? { "aria-invalid": true as const } : {});

  return (
    <form className="the" onSubmit={gui} noValidate>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
          {loi.thongBao}
        </div>
      )}
      {daLuu && (
        <div className="hop-thong-bao tot" role="status" style={{ margin: 16 }}>
          Đã lưu thay đổi.
        </div>
      )}

      <div className="phan-form">
        <h3>Thông tin đăng nhập</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="email">
              Email <span className="bat-buoc">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={gt.email}
              onChange={(e) => dat("email", e.target.value)}
              readOnly={!laTaoMoi}
              required
              autoComplete="off"
              {...aria("email")}
            />
            {laTaoMoi ? <span className="goi-y">Dùng để đăng nhập. Không đổi được sau khi tạo.</span> : null}
            <LoiTruong loi={loi} truong="email" />
          </div>
          <div className="truong">
            <label htmlFor="hoTen">
              Họ tên <span className="bat-buoc">*</span>
            </label>
            <input id="hoTen" type="text" value={gt.hoTen} onChange={(e) => dat("hoTen", e.target.value)} required {...aria("hoTen")} />
            <LoiTruong loi={loi} truong="hoTen" />
          </div>

          {laTaoMoi && (
            <>
              <div className="truong">
                <label htmlFor="matKhau">
                  Mật khẩu khởi tạo <span className="bat-buoc">*</span>
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    id="matKhau"
                    type="text"
                    value={matKhau}
                    onChange={(e) => datMatKhau(e.target.value)}
                    autoComplete="new-password"
                    spellCheck={false}
                    aria-invalid={loiMatKhau.length > 0 || undefined}
                  />
                  <button type="button" className="nut" onClick={() => datMatKhau(sinhMatKhauTam())}>
                    Tạo ngẫu nhiên
                  </button>
                </div>
                <span className={loiMatKhau.length ? "loi-truong" : "goi-y"}>
                  {loiMatKhau.length ? loiMatKhau.join(" ") : "Tối thiểu 10 ký tự, có chữ và số. Trao trực tiếp cho nhân viên, không gửi qua nhóm chat."}
                </span>
              </div>
              <div className="truong" style={{ justifyContent: "center" }}>
                <label className="o-chon">
                  <input type="checkbox" checked={batDoi} onChange={(e) => datBatDoi(e.target.checked)} />
                  <span>
                    Bắt đổi mật khẩu ở lần đăng nhập đầu
                    <small>Nên bật: chỉ nhân viên biết mật khẩu cuối cùng của mình.</small>
                  </span>
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="phan-form">
        <h3>Hồ sơ nhân sự</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="dienThoai">Điện thoại</label>
            <input id="dienThoai" type="tel" value={gt.dienThoai} onChange={(e) => dat("dienThoai", e.target.value)} {...aria("dienThoai")} />
            <LoiTruong loi={loi} truong="dienThoai" />
          </div>
          <div className="truong">
            <label htmlFor="maNhanVien">Mã nhân viên</label>
            <input id="maNhanVien" type="text" value={gt.maNhanVien} onChange={(e) => dat("maNhanVien", e.target.value)} {...aria("maNhanVien")} />
            <LoiTruong loi={loi} truong="maNhanVien" />
          </div>
          <div className="truong">
            <label htmlFor="chucDanh">Chức danh</label>
            <input id="chucDanh" type="text" value={gt.chucDanh} onChange={(e) => dat("chucDanh", e.target.value)} />
          </div>
          <div className="truong">
            <label htmlFor="phongBanId">Phòng ban</label>
            <select id="phongBanId" value={gt.phongBanId} onChange={(e) => dat("phongBanId", e.target.value)} {...aria("phongBanId")}>
              <option value="">— Chưa gán —</option>
              {luaChon.phongBan.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="goi-y">Quyết định phạm vi dữ liệu kiểu “Phòng ban”.</span>
          </div>
          <div className="truong">
            <label htmlFor="quanLyId">Quản lý trực tiếp</label>
            <select id="quanLyId" value={gt.quanLyId} onChange={(e) => dat("quanLyId", e.target.value)} {...aria("quanLyId")}>
              <option value="">— Không có —</option>
              {luaChon.nguoi
                .filter((n) => n.id !== banDau.id)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.hoTen} ({n.email})
                  </option>
                ))}
            </select>
            <span className="goi-y">Quản lý thấy dữ liệu của nhân viên mình khi vai trò có phạm vi “Nhóm”.</span>
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Vai trò</h3>
        {!duocDoiVaiTro && (
          <p className="phu">Bạn không có quyền đổi vai trò (cần quyền Sửa phân hệ Vai trò).</p>
        )}
        <div className="luoi-form">
          {luaChon.vaiTro.map((v) => (
            <label className="o-chon" key={v.id} style={{ marginBottom: 10 }}>
              <input
                type="checkbox"
                disabled={!duocDoiVaiTro}
                checked={gt.vaiTroIds.includes(v.id)}
                onChange={(e) =>
                  dat("vaiTroIds", e.target.checked ? [...gt.vaiTroIds, v.id] : gt.vaiTroIds.filter((x) => x !== v.id))
                }
              />
              <span>
                {v.name}
                {v.description && <small>{v.description}</small>}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/quan-tri/nguoi-dung")}>
          {laTaoMoi ? "Hủy" : "Về danh sách"}
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || (laTaoMoi && loiMatKhau.length > 0)}>
          {dangGui ? "Đang lưu…" : laTaoMoi ? "Tạo người dùng" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
