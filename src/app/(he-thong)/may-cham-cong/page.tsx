import Link from "next/link";
import { headers } from "next/headers";
import DauTrang from "@/components/ui/DauTrang";
import TrangThai from "@/components/ui/TrangThai";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh, { type TruongForm } from "@/components/nhan-su/FormNhanh";
import NhapCsvXemTruoc from "@/components/nhan-su/NhapCsvXemTruoc";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauMotTrongCacQuyen, type ThamSoTrang } from "@/lib/trang";
import { layIpKhach } from "@/lib/yeu-cau";
import { coQuyenMay, danhSachMay, danhSachMayLa, danhSachPinChuaKhop, nhanVienChoAnhXa } from "@/modules/cham-cong/may-cham-cong";
import NhapCsv from "../nhan-su/may-cham-cong/NhapCsv";
import KiemTraKetNoi from "./KiemTraKetNoi";

export const dynamic = "force-dynamic";

const TRANG_THAI = [{ giaTri: "hoat-dong", nhan: "Hoạt động" }, { giaTri: "ngung-hoat-dong", nhan: "Ngừng" }];

/** Thông số khai trên máy (QĐ-178): lấy từ APP_URL, không có thì từ host của yêu cầu hiện tại. */
function thongSoKetNoi(host: string | null, giaoThuc: string | null) {
  let url: URL | null = null;
  try {
    url = process.env.APP_URL ? new URL(process.env.APP_URL) : host ? new URL(`${giaoThuc ?? "http"}://${host}`) : null;
  } catch {
    url = null;
  }
  const https = url?.protocol === "https:";
  return {
    diaChi: url?.hostname ?? "tên-miền-cowork",
    cong: url?.port ? Number(url.port) : https ? 443 : 80,
    https,
    duong: "/iclock/cdata",
    nguon: process.env.APP_URL ? "APP_URL" : "địa chỉ bạn đang mở",
  };
}

/**
 * Máy chấm công (0.22.0 — QĐ-176 → QĐ-179): Kỹ thuật kết nối máy mà không thấy hồ sơ hay lương. Hướng dẫn kết nối
 * từng bước, kiểm tra kết nối, máy đang gọi nhưng chưa đăng ký, PIN chưa khớp, nhập CSV ánh xạ PIN ↔ email.
 */
export default async function TrangMayChamCong({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauMotTrongCacQuyen(["may_cham_cong.view", "nhan_su.view"]);
  const sp = await searchParams;
  const snTim = layMot(sp.sn).trim() || null;
  const h = await headers();
  const ip = layIpKhach(h);
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo, ip);
    return {
      may: await danhSachMay(nc),
      pin: await danhSachPinChuaKhop(nc),
      mayLa: coQuyenMay(nc, "create") ? await danhSachMayLa(nc, snTim) : [],
      diaDiem: await tx.workLocation.findMany({ where: { status: "hoat-dong" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      nguoi: await nhanVienChoAnhXa(nc),
      tao: coQuyenMay(nc, "create"),
      sua: coQuyenMay(nc, "update"),
    };
  });
  const nhap = coQuyen(nd.hoSo, "cham_cong.update");
  const duyet = coQuyen(nd.hoSo, "cham_cong.approve");
  const luaDiaDiem = [{ giaTri: "", nhan: "— Chưa chọn (Nhân sự bổ sung sau) —" }, ...d.diaDiem.map((x) => ({ giaTri: x.id, nhan: x.name }))];
  const ks = thongSoKetNoi(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  const tMay: TruongForm[] = [
    { ten: "ten", nhan: "Tên máy", kieu: "text", batBuoc: true },
    { ten: "diaDiemId", nhan: "Đặt tại (không bắt buộc)", kieu: "select", luaChon: luaDiaDiem },
    { ten: "ipChoPhep", nhan: "Chỉ nhận từ IP (tùy chọn)", kieu: "dong-ip", caDong: true, goiY: "IP công cộng của văn phòng, cách nhau dấu phẩy. Trống = nhận từ mọi IP (vẫn phải đúng SN)." },
  ];

  return (
    <>
      <DauTrang
        tieuDe="Máy chấm công"
        duongDan={[{ nhan: "Kỹ thuật" }]}
        moTa="Máy vân tay ZKTeco gửi dữ liệu về Cowork qua giao thức ADMS / PUSH. Kỹ thuật đăng ký và kết nối máy; Nhân sự gán mã chấm công cho nhân viên. Màn hình này không hiện hồ sơ hay lương."
        hanhDong={d.tao && (
          <FormNhanh nhanNut="Đăng ký máy" tieuDe="Đăng ký máy chấm công" url="/api/v1/nhan-su/may-cham-cong" lopNut="nut chinh"
            truong={[{ ten: "soSeri", nhan: "Số sê-ri (SN)", kieu: "text", batBuoc: true, goiY: "Xem trên máy: Menu → Thông tin hệ thống → Thông tin thiết bị." }, ...tMay]}
            giaTriDau={{ diaDiemId: "", ipChoPhep: [] }} />
        )}
      />

      <section className="the">
        <div className="dau"><h2>Hướng dẫn kết nối máy (từng bước)</h2></div>
        <div className="than" style={{ padding: 16 }}>
          <ol>
            <li>Trên máy: <strong>Menu → Kết nối (Comm.) → Cloud Server / ADMS</strong> (tên mục tùy mẫu máy).</li>
            <li>Khai các thông số (lấy từ {ks.nguon}):
              <table className="bang" style={{ maxWidth: 560, margin: "8px 0" }}>
                <tbody>
                  <tr><th>Server Address (Địa chỉ máy chủ)</th><td><code>{ks.diaChi}</code></td></tr>
                  <tr><th>Server Port (Cổng)</th><td><code>{ks.cong}</code>{ks.https && <span className="phu nho"> — máy không hỗ trợ HTTPS: tắt HTTPS và dùng cổng <code>80</code> (máy chủ mở HTTP riêng cho /iclock)</span>}</td></tr>
                  <tr><th>HTTPS</th><td>{ks.https ? "Bật (nếu máy hỗ trợ)" : "Tắt"}</td></tr>
                  <tr><th>Đường dẫn máy gọi</th><td><code>{ks.duong}</code> <span className="phu nho">(máy tự thêm, chỉ khai nếu mẫu máy hỏi)</span></td></tr>
                  <tr><th>Proxy</th><td>Tắt</td></tr>
                </tbody>
              </table>
            </li>
            <li>Đăng ký máy ở đây bằng <strong>số sê-ri (SN)</strong>. Chưa đăng ký mà máy đã gọi về thì máy hiện ở mục <em>Máy đang gọi nhưng chưa đăng ký</em> — bấm <strong>Đăng ký máy này</strong>; máy sẽ được yêu cầu gửi lại toàn bộ nhật ký chấm công.</li>
            <li>Bấm <strong>Kiểm tra kết nối</strong> ở dòng của máy: thấy lần gọi cuối và IP nguồn là đã thông.</li>
            <li>Gán mã chấm công (PIN trên máy) cho nhân viên: từng người ở mục <em>PIN chưa khớp</em>, hoặc nhập CSV <code>Mã chấm công, Email</code>.</li>
          </ol>
          <p className="phu nho">Chi tiết: <code>docs/HUONG-DAN-CHAM-CONG.md</code>. Địa điểm đặt máy không bắt buộc lúc đăng ký — Nhân sự bổ sung sau (cần để tính tốc độ di chuyển bất thường).</p>
        </div>
      </section>

      {d.tao && (
        <section className="the">
          <div className="dau"><h2>Máy đang gọi nhưng chưa đăng ký</h2></div>
          <p className="phu nho" style={{ marginTop: 0 }}>
            Cowork KHÔNG lưu lần chấm của máy chưa đăng ký. Chỉ hiện máy gọi từ cùng mạng (IP) với bạn hoặc với một máy đã đăng ký của công ty —
            không thấy máy của mình thì gõ đúng SN để tìm.
          </p>
          <form method="get" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input name="sn" defaultValue={snTim ?? ""} placeholder="Tìm đúng SN" aria-label="Số sê-ri cần tìm" />
            <button type="submit" className="nut nho">Tìm</button>
          </form>
          {d.mayLa.length === 0 ? <p className="phu">Không có máy lạ nào bạn được thấy.</p> : (
            <div className="cuon-ngang"><table className="bang">
              <thead><tr><th>SN</th><th>Mẫu máy</th><th>IP</th><th>Lần đầu</th><th>Lần cuối</th><th className="so">Số lần gọi</th><th /></tr></thead>
              <tbody>{d.mayLa.map((m) => (
                <tr key={m.soSeri}>
                  <td><code>{m.soSeri}</code></td><td>{m.model ?? "—"}</td><td>{m.ipCuoi ?? "—"}{m.cungIpVoiBan && <span className="huy-hieu"> cùng mạng với bạn</span>}</td>
                  <td>{dinhDangNgayGio(m.lanDau)}</td><td>{dinhDangNgayGio(m.lanCuoi)}</td><td className="so">{m.soLan}</td>
                  <td><FormNhanh nhanNut="Đăng ký máy này" tieuDe={`Đăng ký máy ${m.soSeri}`} url="/api/v1/nhan-su/may-cham-cong" lopNut="nut nho chinh"
                    truong={[{ ten: "soSeri", nhan: "Số sê-ri (SN)", kieu: "text", batBuoc: true }, ...tMay]}
                    giaTriDau={{ soSeri: m.soSeri, ten: m.model ? `Máy ${m.model}` : `Máy ${m.soSeri}`, diaDiemId: "", ipChoPhep: [] }} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}

      <section className="the">
        <div className="dau"><h2>Máy đã đăng ký</h2><span className="phu nho">Mất kết nối khi im lặng quá {d.may.nguongPhut} phút (Cấu hình)</span></div>
        {d.may.dong.length === 0 ? <TrongRong tieuDe="Chưa có máy nào">Đăng ký máy bằng SN, hoặc chờ máy gọi về rồi bấm “Đăng ký máy này”.</TrongRong> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Tên</th><th>SN</th><th>Địa điểm</th><th>Kết nối</th><th>Lần cuối</th><th>IP cuối</th><th>Thông tin máy</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>{d.may.dong.map((m) => {
              const tt = (m.thongTin ?? {}) as Record<string, string>;
              return (
                <tr key={m.id}>
                  <td>{m.ten}</td><td><code>{m.soSeri}</code></td>
                  <td>{m.diaDiem?.ten ?? <span className="huy-hieu canh-bao">Chưa chọn</span>}</td>
                  <td><span className={`huy-hieu ${m.trucTuyen ? "tot" : "loi"}`}>{m.trucTuyen ? "Trực tuyến" : "Mất kết nối"}</span></td>
                  <td>{m.lanCuoi ? dinhDangNgayGio(m.lanCuoi) : "Chưa từng gọi về"}</td><td>{m.ipCuoi ?? "—"}</td>
                  <td className="nho">{[tt.phienBan, tt.soNguoi && `${tt.soNguoi} người`, tt.soBanGhi && `${tt.soBanGhi} bản ghi`].filter(Boolean).join(" · ") || "—"}</td>
                  <td><TrangThai giaTri={m.trangThai} /></td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <KiemTraKetNoi id={m.id} />
                    {d.sua && <FormNhanh nhanNut="Sửa" tieuDe={`Sửa ${m.ten}`} url={`/api/v1/nhan-su/may-cham-cong/${m.id}`} phuongThuc="PUT" lopNut="nut nho"
                      truong={[...tMay, { ten: "trangThai", nhan: "Trạng thái", kieu: "select", luaChon: TRANG_THAI }]}
                      giaTriDau={{ ten: m.ten, diaDiemId: m.diaDiem?.id ?? "", ipChoPhep: m.ipChoPhep, trangThai: m.trangThai }} />}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>

      <section className="the">
        <div className="dau"><h2>Mã chấm công (PIN) chưa khớp người</h2></div>
        <p className="phu nho" style={{ marginTop: 0 }}>
          Máy gửi lên PIN chưa gán cho ai: lần chấm vẫn được lưu, chờ gán. Gán người ở đây thì các lần chấm cũ của PIN đó được tính cho người được gán —
          <strong> chỉ từ ngày vào làm</strong> và <strong>chỉ trong kỳ bảng công chưa khóa</strong>. Lần chấm thuộc kỳ đã khóa còn nằm lại; người có quyền duyệt
          chấm công chọn &quot;Áp cả kỳ đã khóa&quot; thì bảng công kỳ sau tự sinh dòng điều chỉnh.
        </p>
        {d.pin.length === 0 ? <p className="phu">Không có PIN nào chưa khớp.</p> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>PIN</th><th className="so">Số lần chấm</th><th>Đầu tiên</th><th>Gần nhất</th><th>Đã gán cho</th>{d.sua && <th />}</tr></thead>
            <tbody>{d.pin.map((p) => (
              <tr key={p.pin}>
                <td><code>{p.pin}</code></td><td className="so">{p.soLanCham}</td><td>{dinhDangNgayGio(p.dauTien)}</td><td>{dinhDangNgayGio(p.ganNhat)}</td>
                <td>{p.nguoiDaGan ? <>{p.nguoiDaGan.hoTen}<div className="phu nho">Còn lại thuộc kỳ đã khóa{p.nguoiDaGan.ngayVaoLam ? ` hoặc trước ngày vào làm ${p.nguoiDaGan.ngayVaoLam.split("-").reverse().join("/")}` : ""} — không tự áp.</div></> : "—"}</td>
                {d.sua && p.nguoiDaGan && <td>{duyet && <FormNhanh nhanNut="Áp cả kỳ đã khóa…" tieuDe={`Áp PIN ${p.pin} cho ${p.nguoiDaGan.hoTen} cả kỳ đã khóa`} url="/api/v1/nhan-su/pin-chua-khop" lopNut="nut nho"
                  truong={[
                    { ten: "pin", nhan: "PIN", kieu: "text" },
                    { ten: "apCaKyDaKhoa", nhan: "Tôi xác nhận áp cả lần chấm thuộc kỳ bảng công đã khóa (bảng công kỳ sau sinh dòng điều chỉnh; lần chấm trước ngày vào làm vẫn không áp)", kieu: "checkbox" },
                  ]}
                  themVaoThan={{ nguoiId: p.nguoiDaGan.id }}
                  giaTriDau={{ pin: p.pin, apCaKyDaKhoa: false }} />}</td>}
                {d.sua && !p.nguoiDaGan && <td><FormNhanh nhanNut="Gán cho…" tieuDe={`Gán PIN ${p.pin}`} url="/api/v1/nhan-su/pin-chua-khop" lopNut="nut nho"
                  truong={[
                    { ten: "pin", nhan: "PIN", kieu: "text" },
                    { ten: "nguoiId", nhan: "Nhân viên (chưa có mã chấm công)", kieu: "select", caDong: true, luaChon: d.nguoi.filter((n) => !n.pin).map((n) => ({ giaTri: n.id, nhan: n.hoTen })) },
                  ]}
                  giaTriDau={{ pin: p.pin, nguoiId: d.nguoi.find((n) => !n.pin)?.id ?? "" }} /></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      {d.sua && (
        <section className="the">
          <div className="dau"><h2>Nhập CSV ánh xạ PIN ↔ email</h2></div>
          <NhapCsvXemTruoc url="/api/v1/may-cham-cong/nhap-anh-xa-pin" nhanGhi="Gán mã chấm công"
            goiY="Hai cột: Mã chấm công (PIN trên máy) và Email (email đăng nhập Cowork của nhân viên). Ô bắt đầu bằng = + - @ bị bỏ qua. Người đang có mã khác thì báo lỗi dòng — đổi ở hồ sơ nhân sự."
            cot={[["pin", "PIN"], ["hoTen", "Nhân viên"], ["daCo", "Đã gán sẵn"]]} />
        </section>
      )}

      {nhap && (
        <section className="the">
          <div className="dau"><h2>Nhập lần chấm từ tệp (dự phòng)</h2></div>
          <p className="phu nho" style={{ marginTop: 0 }}>Dùng khi máy không đẩy được dữ liệu qua mạng: xuất dữ liệu chấm công từ phần mềm của máy rồi tải lên đây.</p>
          <NhapCsv />
        </section>
      )}
      <p className="phu nho">Công của người không có máy / GPS: Nhân sự đặt ở <Link href="/cham-cong/bang-cong">Bảng công</Link> → Đặt công tay.</p>
    </>
  );
}
