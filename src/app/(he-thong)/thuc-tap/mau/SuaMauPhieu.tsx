"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import PhieuThucTapIn from "@/components/danh-gia/PhieuThucTapIn";
import {
  LuocDoMauPhieu,
  NGUON_THONG_TIN,
  NGUON_TU_DONG,
  NHAN_NGUON_THONG_TIN,
  NHAN_NGUON_TU_DONG,
  NHAN_THANG_TIEU_CHI,
  THANG_TIEU_CHI,
  type MauPhieu,
  type NguonTuDong,
  type ThangTieuChi,
} from "@/modules/danh-gia/tinh-toan";
import { diChuyen, dienMaTrong, kiemMauSoan, tongTrongSo } from "@/modules/danh-gia/soan-mau";

/**
 * Trình soạn mẫu phiếu đánh giá thực tập (DG-72, QĐ-131) dạng BIỂU MẪU: thêm / xóa / sắp xếp ô thông tin,
 * phần, tiêu chí; chọn thang (điểm 10, thang chữ, có / không), trọng số, nguồn tự động; thang chữ; ô nhận
 * xét, ô ký, ghi chú; xem trước bản in A4. Mã tự sinh từ tên. Lưu đúng lược đồ `LuocDoMauPhieu` (máy chủ kiểm
 * lại). Chế độ "JSON nâng cao" giữ cho người rành. Sửa mẫu không đổi phiếu đã tạo (phiếu chụp mẫu lúc tạo).
 */

type CheDo = "bieu-mau" | "json" | "xem-truoc";

function MuiTen({ len, xuong, xoa, nhan }: { len: () => void; xuong: () => void; xoa: () => void; nhan: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, whiteSpace: "nowrap" }}>
      <button type="button" className="nut nho" onClick={len} title={`Đưa ${nhan} lên`} aria-label={`Đưa ${nhan} lên`}>↑</button>
      <button type="button" className="nut nho" onClick={xuong} title={`Đưa ${nhan} xuống`} aria-label={`Đưa ${nhan} xuống`}>↓</button>
      <button type="button" className="nut nho trong" onClick={xoa} title={`Xóa ${nhan}`} aria-label={`Xóa ${nhan}`}>✕</button>
    </span>
  );
}

const tieuChiMoi = (): MauPhieu["phan"][number]["tieuChi"][number] => ({ ma: "", ten: "", trongSo: 10, thang: "10", nguon: null, moTa: "" });

export default function SuaMauPhieu({ mau, mauGoc, nhanNut, lopNut = "nut chinh" }: { mau?: { id: string; ma: string; ten: string; truong: string; trangThai: string; boCuc: unknown }; mauGoc: unknown; nhanNut: string; lopNut?: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const batDau = () => {
    const r = LuocDoMauPhieu.safeParse(mau?.boCuc ?? mauGoc);
    return r.success ? r.data : LuocDoMauPhieu.parse(mauGoc);
  };
  const dauThongTin = { ma: mau?.ma ?? "", ten: mau?.ten ?? "", truong: mau?.truong ?? "", trangThai: mau?.trangThai ?? "hoat-dong" };
  const [gt, datGt] = useState(dauThongTin);
  const [bc, datBc] = useState<MauPhieu>(batDau);
  const [cheDo, datCheDo] = useState<CheDo>("bieu-mau");
  const [json, datJson] = useState("");
  const [loiSoan, datLoiSoan] = useState<string[]>([]);

  const sua = (f: (m: MauPhieu) => MauPhieu) => datBc((m) => f(m));
  const suaPhan = (i: number, f: (p: MauPhieu["phan"][number]) => MauPhieu["phan"][number]) => sua((m) => ({ ...m, phan: m.phan.map((p, k) => (k === i ? f(p) : p)) }));
  const suaTc = (i: number, j: number, f: (t: MauPhieu["phan"][number]["tieuChi"][number]) => MauPhieu["phan"][number]["tieuChi"][number]) =>
    suaPhan(i, (p) => ({ ...p, tieuChi: p.tieuChi.map((t, k) => (k === j ? f(t) : t)) }));

  function doiCheDo(moi: CheDo) {
    datLoiSoan([]);
    if (cheDo === "json" && moi !== "json") {
      let x: unknown;
      try {
        x = JSON.parse(json);
      } catch (e) {
        datLoiSoan([`JSON chưa đúng dạng: ${e instanceof Error ? e.message : ""}`]);
        return;
      }
      const r = LuocDoMauPhieu.safeParse(x);
      if (!r.success) {
        datLoiSoan(["JSON không đúng lược đồ mẫu phiếu — sửa lại hoặc bấm Lưu để xem lỗi chi tiết."]);
        return;
      }
      datBc(r.data);
    }
    if (moi === "json") datJson(JSON.stringify(dienMaTrong(bc), null, 2));
    datCheDo(moi);
  }

  async function gui() {
    datLoiSoan([]);
    let boCuc: MauPhieu = bc;
    if (cheDo === "json") {
      try {
        boCuc = JSON.parse(json) as MauPhieu;
      } catch (e) {
        datLoiSoan([`JSON chưa đúng dạng: ${e instanceof Error ? e.message : ""}`]);
        return;
      }
    }
    const k = kiemMauSoan(boCuc);
    if (!k.mau) {
      datLoiSoan(k.loi);
      return;
    }
    if (await goi(mau ? `/api/v1/thuc-tap/mau-phieu/${mau.id}` : "/api/v1/thuc-tap/mau-phieu", mau ? "PUT" : "POST", { ...gt, boCuc: k.mau })) {
      hop.current?.close();
      router.refresh();
    }
  }

  const loiTruong = loi ? Object.entries(loi.loiTruong ?? {}).filter(([, v]) => v?.length).map(([k, v]) => `${k}: ${v!.join(" ")}`) : [];
  const xemTruoc = cheDo === "xem-truoc" ? kiemMauSoan(bc) : null;
  const coThangChu = bc.phan.some((p) => p.tieuChi.some((t) => t.thang === "chu"));

  return (
    <>
      <button type="button" className={lopNut} onClick={() => { datGt(dauThongTin); datBc(batDau()); datCheDo("bieu-mau"); datLoi(null); datLoiSoan([]); hop.current?.showModal(); }}>{nhanNut}</button>
      <HopThoai ref={hop} tieuDe={mau ? `Sửa mẫu ${mau.ten}` : "Thêm mẫu phiếu"} rong={1000}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}{loiTruong.length ? <ul>{loiTruong.map((l) => <li key={l}>{l}</li>)}</ul> : null}</div>}
          {loiSoan.length > 0 && <div className="hop-thong-bao loi" role="alert">Mẫu chưa hợp lệ:<ul>{loiSoan.map((l) => <li key={l}>{l}</li>)}</ul></div>}
          <div className="luoi-form">
            <div className="truong"><label htmlFor="mp-ma">Mã mẫu *</label><input id="mp-ma" value={gt.ma} onChange={(e) => datGt({ ...gt, ma: e.target.value })} placeholder="dh-bach-khoa" /></div>
            <div className="truong"><label htmlFor="mp-ten">Tên mẫu *</label><input id="mp-ten" value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} /></div>
            <div className="truong"><label htmlFor="mp-truong">Trường</label><input id="mp-truong" value={gt.truong} onChange={(e) => datGt({ ...gt, truong: e.target.value })} /></div>
            <div className="truong"><label htmlFor="mp-tt">Trạng thái</label><select id="mp-tt" value={gt.trangThai} onChange={(e) => datGt({ ...gt, trangThai: e.target.value })}><option value="hoat-dong">Đang dùng</option><option value="ngung-hoat-dong">Ngừng</option></select></div>
          </div>
          <div role="tablist" style={{ display: "flex", gap: 6, margin: "12px 0" }}>
            {([["bieu-mau", "Soạn theo biểu mẫu"], ["xem-truoc", "Xem trước bản in"], ["json", "JSON nâng cao"]] as const).map(([ma, nhan]) => (
              <button key={ma} type="button" role="tab" aria-selected={cheDo === ma} className={cheDo === ma ? "nut chinh nho" : "nut nho"} onClick={() => doiCheDo(ma)}>{nhan}</button>
            ))}
          </div>

          {cheDo === "json" && (
            <div className="truong">
              <label htmlFor="mp-json">Bố cục phiếu (JSON)</label>
              <textarea id="mp-json" rows={22} spellCheck={false} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} value={json} onChange={(e) => datJson(e.target.value)} />
              <span className="goi-y">Cho người rành: lược đồ ở docs/HUONG-DAN-DANH-GIA.md, mục “Mẫu phiếu đánh giá thực tập”. Thang: &quot;10&quot;, &quot;chu&quot;, &quot;co-khong&quot;; nguồn tự động: chuyen-can, ty-le-viec-dat, chat-luong-viec.</span>
            </div>
          )}

          {cheDo === "xem-truoc" && xemTruoc && (
            xemTruoc.mau ? (
              <div style={{ border: "1px solid var(--vien, #ddd)", padding: 12, maxHeight: 560, overflow: "auto", background: "#fff", color: "#111" }}>
                <PhieuThucTapIn d={{ mau: xemTruoc.mau, thongTin: {}, ketQua: null, nhanXet: {}, ngayLap: "Ngày …… tháng …… năm ……", banNhap: true }} />
              </div>
            ) : (
              <div className="hop-thong-bao loi" role="alert">Chưa xem trước được — mẫu còn lỗi:<ul>{xemTruoc.loi.map((l) => <li key={l}>{l}</li>)}</ul></div>
            )
          )}

          {cheDo === "bieu-mau" && (
            <>
              <h3>Đầu phiếu</h3>
              <div className="luoi-form">
                <div className="truong"><label htmlFor="mp-dv">Tên đơn vị (góc trái)</label><input id="mp-dv" value={bc.tenDonVi} onChange={(e) => sua((m) => ({ ...m, tenDonVi: e.target.value }))} /></div>
                <div className="truong"><label htmlFor="mp-td">Tiêu đề *</label><input id="mp-td" value={bc.tieuDe} onChange={(e) => sua((m) => ({ ...m, tieuDe: e.target.value }))} /></div>
                <div className="truong"><label htmlFor="mp-tdp">Tiêu đề phụ</label><input id="mp-tdp" value={bc.tieuDePhu} onChange={(e) => sua((m) => ({ ...m, tieuDePhu: e.target.value }))} /></div>
              </div>
              <label className="nho" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={bc.quocHieu} onChange={(e) => sua((m) => ({ ...m, quocHieu: e.target.checked }))} /> In quốc hiệu, tiêu ngữ</label>
              <label className="nho" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={bc.hienChu} onChange={(e) => sua((m) => ({ ...m, hienChu: e.target.checked }))} /> Hiện điểm tổng bằng chữ (theo thang chữ)</label>

              <h3>Ô thông tin</h3>
              <table className="bang">
                <thead><tr><th>Nhãn in trên phiếu</th><th>Lấy từ</th><th /></tr></thead>
                <tbody>{bc.thongTin.map((t, i) => (
                  <tr key={i}>
                    <td><input aria-label={`Nhãn ô thông tin ${i + 1}`} value={t.nhan} onChange={(e) => sua((m) => ({ ...m, thongTin: m.thongTin.map((x, k) => (k === i ? { ...x, nhan: e.target.value } : x)) }))} /></td>
                    <td>
                      <select aria-label={`Nguồn ô thông tin ${i + 1}`} value={t.nguon} onChange={(e) => sua((m) => ({ ...m, thongTin: m.thongTin.map((x, k) => (k === i ? { ...x, nguon: e.target.value as (typeof NGUON_THONG_TIN)[number] } : x)) }))}>
                        {NGUON_THONG_TIN.map((n) => <option key={n} value={n}>{NHAN_NGUON_THONG_TIN[n]}</option>)}
                      </select>
                    </td>
                    <td><MuiTen nhan="ô thông tin" len={() => sua((m) => ({ ...m, thongTin: diChuyen(m.thongTin, i, -1) }))} xuong={() => sua((m) => ({ ...m, thongTin: diChuyen(m.thongTin, i, 1) }))} xoa={() => sua((m) => ({ ...m, thongTin: m.thongTin.filter((_, k) => k !== i) }))} /></td>
                  </tr>
                ))}</tbody>
              </table>
              <button type="button" className="nut nho" onClick={() => sua((m) => ({ ...m, thongTin: [...m.thongTin, { ma: "", nhan: "", nguon: "tu-nhap" }] }))}>+ Thêm ô thông tin</button>

              <h3>Phần và tiêu chí <span className="phu nho">— tổng trọng số {tongTrongSo(bc).toLocaleString("vi-VN")} (điểm tổng = trung bình có trọng số, thang 10)</span></h3>
              {bc.phan.map((p, i) => (
                <section key={i} className="the" style={{ padding: 10, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input aria-label={`Tên phần ${i + 1}`} style={{ flex: 1, fontWeight: 600 }} value={p.ten} placeholder="Ví dụ: I. Ý thức, thái độ" onChange={(e) => suaPhan(i, (x) => ({ ...x, ten: e.target.value }))} />
                    <MuiTen nhan="phần" len={() => sua((m) => ({ ...m, phan: diChuyen(m.phan, i, -1) }))} xuong={() => sua((m) => ({ ...m, phan: diChuyen(m.phan, i, 1) }))} xoa={() => sua((m) => ({ ...m, phan: m.phan.filter((_, k) => k !== i) }))} />
                  </div>
                  <div className="cuon-ngang"><table className="bang">
                    <thead><tr><th>Tiêu chí</th><th style={{ width: 90 }}>Trọng số</th><th style={{ width: 130 }}>Thang</th><th style={{ width: 210 }}>Nguồn tự động</th><th /></tr></thead>
                    <tbody>{p.tieuChi.map((t, j) => (
                      <tr key={j}>
                        <td>
                          <input aria-label={`Tên tiêu chí ${j + 1} phần ${i + 1}`} value={t.ten} placeholder="Tên tiêu chí" onChange={(e) => suaTc(i, j, (x) => ({ ...x, ten: e.target.value }))} />
                          <input aria-label={`Mô tả tiêu chí ${j + 1} phần ${i + 1}`} className="nho" value={t.moTa} placeholder="Mô tả (không bắt buộc)" onChange={(e) => suaTc(i, j, (x) => ({ ...x, moTa: e.target.value }))} />
                        </td>
                        <td><input aria-label="Trọng số" type="number" min={0.01} max={100} step="any" value={Number.isFinite(t.trongSo) ? t.trongSo : ""} onChange={(e) => suaTc(i, j, (x) => ({ ...x, trongSo: e.target.value === "" ? Number.NaN : Number(e.target.value) }))} /></td>
                        <td>
                          <select aria-label="Thang" value={t.thang} onChange={(e) => suaTc(i, j, (x) => ({ ...x, thang: e.target.value as ThangTieuChi }))}>
                            {THANG_TIEU_CHI.map((x) => <option key={x} value={x}>{NHAN_THANG_TIEU_CHI[x]}</option>)}
                          </select>
                        </td>
                        <td>
                          <select aria-label="Nguồn tự động" value={t.nguon ?? ""} onChange={(e) => suaTc(i, j, (x) => ({ ...x, nguon: (e.target.value || null) as NguonTuDong | null }))}>
                            <option value="">— Người hướng dẫn chấm —</option>
                            {NGUON_TU_DONG.map((n) => <option key={n} value={n}>{NHAN_NGUON_TU_DONG[n]}</option>)}
                          </select>
                        </td>
                        <td><MuiTen nhan="tiêu chí" len={() => suaPhan(i, (x) => ({ ...x, tieuChi: diChuyen(x.tieuChi, j, -1) }))} xuong={() => suaPhan(i, (x) => ({ ...x, tieuChi: diChuyen(x.tieuChi, j, 1) }))} xoa={() => suaPhan(i, (x) => ({ ...x, tieuChi: x.tieuChi.filter((_, k) => k !== j) }))} /></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                  <button type="button" className="nut nho" onClick={() => suaPhan(i, (x) => ({ ...x, tieuChi: [...x.tieuChi, tieuChiMoi()] }))}>+ Thêm tiêu chí</button>
                </section>
              ))}
              <button type="button" className="nut nho" onClick={() => sua((m) => ({ ...m, phan: [...m.phan, { ten: "", tieuChi: [tieuChiMoi()] }] }))}>+ Thêm phần</button>

              <h3>Thang chữ {!coThangChu && <span className="phu nho">— chỉ dùng khi có tiêu chí chấm thang chữ, hoặc để quy điểm tổng ra chữ</span>}</h3>
              <table className="bang">
                <thead><tr><th>Chữ</th><th>Điểm quy đổi (thang 10)</th><th>Điểm tổng từ (ngưỡng)</th><th /></tr></thead>
                <tbody>{bc.thangChu.map((c, i) => (
                  <tr key={i}>
                    <td><input aria-label={`Chữ ${i + 1}`} maxLength={3} value={c.chu} onChange={(e) => sua((m) => ({ ...m, thangChu: m.thangChu.map((x, k) => (k === i ? { ...x, chu: e.target.value } : x)) }))} /></td>
                    <td><input aria-label={`Điểm quy đổi ${i + 1}`} type="number" min={0} max={10} step="any" value={c.diem} onChange={(e) => sua((m) => ({ ...m, thangChu: m.thangChu.map((x, k) => (k === i ? { ...x, diem: Number(e.target.value) } : x)) }))} /></td>
                    <td><input aria-label={`Ngưỡng ${i + 1}`} type="number" min={0} max={10} step="any" value={c.tu} onChange={(e) => sua((m) => ({ ...m, thangChu: m.thangChu.map((x, k) => (k === i ? { ...x, tu: Number(e.target.value) } : x)) }))} /></td>
                    <td><MuiTen nhan="mức chữ" len={() => sua((m) => ({ ...m, thangChu: diChuyen(m.thangChu, i, -1) }))} xuong={() => sua((m) => ({ ...m, thangChu: diChuyen(m.thangChu, i, 1) }))} xoa={() => sua((m) => ({ ...m, thangChu: m.thangChu.filter((_, k) => k !== i) }))} /></td>
                  </tr>
                ))}</tbody>
              </table>
              <button type="button" className="nut nho" onClick={() => sua((m) => ({ ...m, thangChu: [...m.thangChu, { chu: "", diem: 0, tu: 0 }] }))}>+ Thêm mức chữ</button>
              <p className="goi-y">Xếp từ cao xuống thấp (ngưỡng giảm dần). Thang Có / Không: Đạt = 10 điểm, Không đạt = 0 điểm.</p>

              <h3>Ô nhận xét</h3>
              {bc.oNhanXet.map((o, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <input aria-label={`Ô nhận xét ${i + 1}`} style={{ flex: 1 }} value={o.nhan} placeholder="Ví dụ: Ưu điểm" onChange={(e) => sua((m) => ({ ...m, oNhanXet: m.oNhanXet.map((x, k) => (k === i ? { ...x, nhan: e.target.value } : x)) }))} />
                  <MuiTen nhan="ô nhận xét" len={() => sua((m) => ({ ...m, oNhanXet: diChuyen(m.oNhanXet, i, -1) }))} xuong={() => sua((m) => ({ ...m, oNhanXet: diChuyen(m.oNhanXet, i, 1) }))} xoa={() => sua((m) => ({ ...m, oNhanXet: m.oNhanXet.filter((_, k) => k !== i) }))} />
                </div>
              ))}
              <button type="button" className="nut nho" onClick={() => sua((m) => ({ ...m, oNhanXet: [...m.oNhanXet, { ma: "", nhan: "" }] }))}>+ Thêm ô nhận xét</button>

              <h3>Ô ký</h3>
              {bc.oKy.map((o, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <input aria-label={`Ô ký ${i + 1}`} style={{ flex: 1 }} value={o.nhan} placeholder="Ví dụ: NGƯỜI HƯỚNG DẪN" onChange={(e) => sua((m) => ({ ...m, oKy: m.oKy.map((x, k) => (k === i ? { ...x, nhan: e.target.value } : x)) }))} />
                  <input aria-label={`Ghi chú ô ký ${i + 1}`} style={{ flex: 1 }} value={o.ghiChu} placeholder="(Ký, ghi rõ họ tên)" onChange={(e) => sua((m) => ({ ...m, oKy: m.oKy.map((x, k) => (k === i ? { ...x, ghiChu: e.target.value } : x)) }))} />
                  <MuiTen nhan="ô ký" len={() => sua((m) => ({ ...m, oKy: diChuyen(m.oKy, i, -1) }))} xuong={() => sua((m) => ({ ...m, oKy: diChuyen(m.oKy, i, 1) }))} xoa={() => sua((m) => ({ ...m, oKy: m.oKy.filter((_, k) => k !== i) }))} />
                </div>
              ))}
              <button type="button" className="nut nho" onClick={() => sua((m) => ({ ...m, oKy: [...m.oKy, { ma: "", nhan: "", ghiChu: "" }] }))}>+ Thêm ô ký</button>

              <h3>Ghi chú cuối phiếu</h3>
              <textarea aria-label="Ghi chú cuối phiếu" rows={3} value={bc.ghiChu} onChange={(e) => sua((m) => ({ ...m, ghiChu: e.target.value }))} />
            </>
          )}
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu mẫu"}</button>
        </div>
      </HopThoai>
    </>
  );
}
