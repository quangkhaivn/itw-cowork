import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrangThai from "@/components/ui/TrangThai";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh, { type TruongForm } from "@/components/nhan-su/FormNhanh";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachMay, danhSachPinChuaKhop } from "@/modules/cham-cong/may-cham-cong";
import { danhSachDiaDiem } from "@/modules/nhan-su/service";
import NhapCsv from "./NhapCsv";

export const dynamic = "force-dynamic";

const TRANG_THAI = [{ giaTri: "hoat-dong", nhan: "Hoạt động" }, { giaTri: "ngung-hoat-dong", nhan: "Ngừng" }];

/** Máy chấm công vân tay (NS-14 → NS-17): đăng ký SN, trạng thái kết nối, PIN chưa khớp, nhập CSV dự phòng. */
export default async function TrangMayChamCong() {
  const nd = await yeuCauQuyen("nhan_su.view");
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      may: await danhSachMay(nc),
      pin: await danhSachPinChuaKhop(nc),
      diaDiem: await danhSachDiaDiem(nc, true),
      nguoi: await tx.user.findMany({
        where: { status: "hoat-dong", isSystem: false },
        select: { id: true, fullName: true, staffProfile: { select: { attendancePin: true } } },
        orderBy: { fullName: "asc" },
      }),
    };
  });
  const tao = coQuyen(nd.hoSo, "nhan_su.create");
  const sua = coQuyen(nd.hoSo, "nhan_su.update");
  const nhap = coQuyen(nd.hoSo, "cham_cong.update");
  const duyet = coQuyen(nd.hoSo, "cham_cong.approve");
  const luaDiaDiem = d.diaDiem.map((x) => ({ giaTri: x.id, nhan: x.ten }));
  const mayChu = process.env.APP_URL ? new URL(process.env.APP_URL).host : "tên-miền-cowork";
  const tMay: TruongForm[] = [
    { ten: "ten", nhan: "Tên máy", kieu: "text", batBuoc: true },
    { ten: "diaDiemId", nhan: "Đặt tại", kieu: "select", luaChon: luaDiaDiem },
    { ten: "ipChoPhep", nhan: "Chỉ nhận từ IP (tùy chọn)", kieu: "dong-ip", caDong: true, goiY: "IP công cộng của văn phòng, cách nhau dấu phẩy. Trống = nhận từ mọi IP (vẫn phải đúng SN)." },
  ];

  return (
    <>
      <DauTrang
        tieuDe="Máy chấm công"
        duongDan={[{ nhan: "Nhân sự" }]}
        moTa={<>Máy vân tay ZKTeco gửi dữ liệu về Cowork qua giao thức ADMS / PUSH. Cài trên máy (Menu → Kết nối / Cloud Server / ADMS — tên mục tùy mẫu máy): địa chỉ máy chủ <code>{mayChu}</code>, cổng 80 (hoặc 443 nếu máy hỗ trợ HTTPS). Hướng dẫn: <code>docs/HUONG-DAN-CHAM-CONG.md</code>.</>}
        hanhDong={tao && luaDiaDiem.length > 0 && (
          <FormNhanh nhanNut="Đăng ký máy" tieuDe="Đăng ký máy chấm công" url="/api/v1/nhan-su/may-cham-cong" lopNut="nut chinh"
            truong={[{ ten: "soSeri", nhan: "Số sê-ri (SN)", kieu: "text", batBuoc: true, goiY: "Xem trên máy: Menu → Thông tin hệ thống → Thông tin thiết bị." }, ...tMay]}
            giaTriDau={{ diaDiemId: luaDiaDiem[0].giaTri, ipChoPhep: [] }} />
        )}
      />
      {luaDiaDiem.length === 0 && <div className="hop-thong-bao canh-bao">Chưa có địa điểm làm việc — tạo ở <Link href="/nhan-su/thiet-lap">Thiết lập chấm công</Link> trước khi đăng ký máy.</div>}

      <section className="the">
        <div className="dau"><h2>Máy đã đăng ký</h2><span className="phu nho">Mất kết nối khi im lặng quá {d.may.nguongPhut} phút (Cấu hình)</span></div>
        {d.may.dong.length === 0 ? <TrongRong tieuDe="Chưa có máy nào">Máy chưa đăng ký gọi vào sẽ bị từ chối.</TrongRong> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Tên</th><th>SN</th><th>Địa điểm</th><th>Kết nối</th><th>Lần cuối</th><th>IP cuối</th><th>Thông tin máy</th><th>Trạng thái</th>{sua && <th />}</tr></thead>
            <tbody>{d.may.dong.map((m) => {
              const tt = (m.thongTin ?? {}) as Record<string, string>;
              return (
                <tr key={m.id}>
                  <td>{m.ten}</td><td><code>{m.soSeri}</code></td><td>{m.diaDiem?.ten ?? "Chưa chọn"}</td>
                  <td><span className={`huy-hieu ${m.trucTuyen ? "tot" : "loi"}`}>{m.trucTuyen ? "Trực tuyến" : "Mất kết nối"}</span></td>
                  <td>{m.lanCuoi ? dinhDangNgayGio(m.lanCuoi) : "Chưa từng gọi về"}</td><td>{m.ipCuoi ?? "—"}</td>
                  <td className="nho">{[tt.phienBan, tt.soNguoi && `${tt.soNguoi} người`, tt.soBanGhi && `${tt.soBanGhi} bản ghi`].filter(Boolean).join(" · ") || "—"}</td>
                  <td><TrangThai giaTri={m.trangThai} /></td>
                  {sua && <td><FormNhanh nhanNut="Sửa" tieuDe={`Sửa ${m.ten}`} url={`/api/v1/nhan-su/may-cham-cong/${m.id}`} phuongThuc="PUT" lopNut="nut nho"
                    truong={[...tMay, { ten: "trangThai", nhan: "Trạng thái", kieu: "select", luaChon: TRANG_THAI }]}
                    giaTriDau={{ ten: m.ten, diaDiemId: m.diaDiem?.id ?? "", ipChoPhep: m.ipChoPhep, trangThai: m.trangThai }} /></td>}
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>

      <section className="the">
        <div className="dau"><h2>Mã chấm công (PIN) chưa khớp người</h2></div>
        <p className="phu nho" style={{ marginTop: 0 }}>
          Máy gửi lên PIN chưa gán cho ai: lần chấm vẫn được lưu. Gán người ở đây (hoặc đặt mã chấm công ở hồ sơ) thì các lần chấm cũ của PIN đó
          được tính cho người được gán — <strong>chỉ từ ngày vào làm</strong> và <strong>chỉ trong kỳ bảng công chưa khóa</strong>. Lần chấm thuộc kỳ đã khóa
          còn nằm lại đây; người có quyền duyệt chấm công chọn &quot;Áp cả kỳ đã khóa&quot; thì bảng công kỳ sau tự sinh dòng điều chỉnh.
        </p>
        {d.pin.length === 0 ? <p className="phu">Không có PIN nào chưa khớp.</p> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>PIN</th><th className="so">Số lần chấm</th><th>Đầu tiên</th><th>Gần nhất</th><th>Đã gán cho</th>{sua && <th />}</tr></thead>
            <tbody>{d.pin.map((p) => (
              <tr key={p.pin}>
                <td><code>{p.pin}</code></td><td className="so">{p.soLanCham}</td><td>{dinhDangNgayGio(p.dauTien)}</td><td>{dinhDangNgayGio(p.ganNhat)}</td>
                <td>
                  {p.nguoiDaGan ? (
                    <>
                      {p.nguoiDaGan.hoTen}
                      <div className="phu nho">Còn lại thuộc kỳ đã khóa{p.nguoiDaGan.ngayVaoLam ? ` hoặc trước ngày vào làm ${p.nguoiDaGan.ngayVaoLam.split("-").reverse().join("/")}` : ""} — không tự áp.</div>
                    </>
                  ) : "—"}
                </td>
                {sua && p.nguoiDaGan && <td>{duyet && <FormNhanh nhanNut="Áp cả kỳ đã khóa…" tieuDe={`Áp PIN ${p.pin} cho ${p.nguoiDaGan.hoTen} cả kỳ đã khóa`} url="/api/v1/nhan-su/pin-chua-khop" lopNut="nut nho"
                  truong={[
                    { ten: "pin", nhan: "PIN", kieu: "text" },
                    { ten: "apCaKyDaKhoa", nhan: "Tôi xác nhận áp cả lần chấm thuộc kỳ bảng công đã khóa (bảng công kỳ sau sinh dòng điều chỉnh; lần chấm trước ngày vào làm vẫn không áp)", kieu: "checkbox" },
                  ]}
                  themVaoThan={{ nguoiId: p.nguoiDaGan.id }}
                  giaTriDau={{ pin: p.pin, apCaKyDaKhoa: false }} />}</td>}
                {sua && !p.nguoiDaGan && <td><FormNhanh nhanNut="Gán cho…" tieuDe={`Gán PIN ${p.pin}`} url="/api/v1/nhan-su/pin-chua-khop" lopNut="nut nho"
                  truong={[
                    { ten: "pin", nhan: "PIN", kieu: "text" },
                    { ten: "nguoiId", nhan: "Nhân viên (chưa có mã chấm công)", kieu: "select", caDong: true, luaChon: d.nguoi.filter((n) => !n.staffProfile?.attendancePin).map((n) => ({ giaTri: n.id, nhan: n.fullName })) },
                  ]}
                  giaTriDau={{ pin: p.pin, nguoiId: d.nguoi.find((n) => !n.staffProfile?.attendancePin)?.id ?? "" }} /></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      {nhap && (
        <section className="the">
          <div className="dau"><h2>Nhập lần chấm từ tệp (dự phòng)</h2></div>
          <p className="phu nho" style={{ marginTop: 0 }}>Dùng khi máy không đẩy được dữ liệu qua mạng: xuất dữ liệu chấm công từ phần mềm của máy rồi tải lên đây.</p>
          <NhapCsv />
        </section>
      )}
    </>
  );
}
