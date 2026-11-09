import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrangThai from "@/components/ui/TrangThai";
import TrongRong from "@/components/ui/TrongRong";
import FormNhanh, { type TruongForm } from "@/components/nhan-su/FormNhanh";
import { taoNguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { docCauHinhChamCong } from "@/modules/cham-cong/chung";
import { duongDanBanDo, NHAN_PHAN_NGAY, type PhanNgay } from "@/modules/cham-cong/tinh-toan";
import { danhSachCa, danhSachDiaDiem, danhSachLich, danhSachLoaiNghi, danhSachNgayLe } from "@/modules/nhan-su/service";
import { homNayVN } from "@/modules/crm/chung";

export const dynamic = "force-dynamic";

const TRANG_THAI = [{ giaTri: "hoat-dong", nhan: "Hoạt động" }, { giaTri: "ngung-hoat-dong", nhan: "Ngừng" }];
const NGAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Thiết lập chấm công (Nhân sự): địa điểm + bán kính GPS, ca, lịch tuần, gán lịch, ngày lễ, loại nghỉ. */
export default async function TrangThietLap({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("nhan_su.view");
  const sp = await searchParams;
  const nam = /^\d{4}$/.test(layMot(sp.nam)) ? Number(layMot(sp.nam)) : Number(homNayVN().slice(0, 4));
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return {
      diaDiem: await danhSachDiaDiem(nc),
      ca: await danhSachCa(nc),
      lich: await danhSachLich(nc),
      ngayLe: await danhSachNgayLe(nc, nam),
      loaiNghi: await danhSachLoaiNghi(nc, false),
      ch: await docCauHinhChamCong(tx),
      nguoi: await tx.user.findMany({ where: { status: "hoat-dong", isSystem: false }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    };
  });
  const tao = coQuyen(nd.hoSo, "nhan_su.create");
  const sua = coQuyen(nd.hoSo, "nhan_su.update");

  const tDiaDiem: TruongForm[] = [
    { ten: "ten", nhan: "Tên địa điểm", kieu: "text", batBuoc: true, caDong: true },
    { ten: "diaChi", nhan: "Địa chỉ", kieu: "text", caDong: true },
    { ten: "viDo", nhan: "Vĩ độ (latitude)", kieu: "number", batBuoc: true, goiY: "Trên Google Maps: nhấn giữ vào vị trí → chép số đầu (vd 10.776900)." },
    { ten: "kinhDo", nhan: "Kinh độ (longitude)", kieu: "number", batBuoc: true, goiY: "Số thứ hai (vd 106.700900)." },
    { ten: "banKinhM", nhan: "Bán kính GPS (mét)", kieu: "number", trongLaNull: true, goiY: `Trống = mặc định Cấu hình: ${d.ch.banKinhMacDinhM} m.` },
  ];
  const tCa: TruongForm[] = [
    { ten: "ma", nhan: "Mã ca", kieu: "text", batBuoc: true },
    { ten: "ten", nhan: "Tên ca", kieu: "text", batBuoc: true },
    { ten: "gioVao", nhan: "Giờ vào", kieu: "time", batBuoc: true },
    { ten: "gioRa", nhan: "Giờ ra", kieu: "time", batBuoc: true, goiY: "Giờ ra nhỏ hơn giờ vào = ca qua đêm." },
    { ten: "gioNghi", nhan: "Bắt đầu nghỉ giữa ca", kieu: "time", goiY: "Dùng để chia nửa ca sáng / chiều." },
    { ten: "phutNghi", nhan: "Số phút nghỉ giữa ca", kieu: "number" },
    { ten: "choPhepMuonPhut", nhan: "Cho phép đi muộn (phút)", kieu: "number", trongLaNull: true, goiY: `Trống = mặc định ${d.ch.choPhepMuonPhut} phút.` },
    { ten: "choPhepSomPhut", nhan: "Cho phép về sớm (phút)", kieu: "number", trongLaNull: true, goiY: `Trống = mặc định ${d.ch.choPhepSomPhut} phút.` },
  ];
  const luaCa = d.ca.filter((c) => c.trangThai === "hoat-dong").map((c) => ({ giaTri: c.id, nhan: `${c.ten} (${c.gioVao}–${c.gioRa})` }));
  const tLich: TruongForm[] = [
    { ten: "ma", nhan: "Mã lịch", kieu: "text", batBuoc: true },
    { ten: "ten", nhan: "Tên lịch", kieu: "text", batBuoc: true },
    { ten: "caId", nhan: "Ca làm", kieu: "select", luaChon: luaCa, caDong: true },
    { ten: "ngay", nhan: "Các ngày trong tuần", kieu: "tuan", goiY: "Ví dụ thứ Bảy làm buổi sáng: chọn \"Sáng\" ở T7." },
  ];
  const tLoaiNghi: TruongForm[] = [
    { ten: "ma", nhan: "Mã", kieu: "text", batBuoc: true },
    { ten: "ten", nhan: "Tên loại nghỉ", kieu: "text", batBuoc: true },
    { ten: "thuTu", nhan: "Thứ tự", kieu: "number" },
    { ten: "coLuong", nhan: "Có lương", kieu: "checkbox" },
    { ten: "truPhepNam", nhan: "Trừ vào quỹ phép năm", kieu: "checkbox" },
  ];

  return (
    <>
      <DauTrang
        tieuDe="Thiết lập chấm công"
        duongDan={[{ nhan: "Nhân sự" }]}
        moTa={<>Địa điểm làm việc (toạ độ + bán kính GPS), ca làm, lịch tuần, gán lịch, ngày lễ, loại nghỉ. Ngưỡng (phút cho phép, nhắc việc, phép năm…) ở <Link href="/quan-tri/cau-hinh">Cấu hình</Link>, nhóm Chấm công / Nghỉ phép.</>}
      />

      <section className="the">
        <div className="dau"><h2>Địa điểm làm việc</h2>{tao && <FormNhanh nhanNut="Thêm địa điểm" tieuDe="Thêm địa điểm" url="/api/v1/nhan-su/dia-diem" truong={tDiaDiem} lopNut="nut chinh nho" />}</div>
        {d.diaDiem.length === 0 ? <TrongRong tieuDe="Chưa có địa điểm">Chấm công GPS chỉ hợp lệ trong bán kính một địa điểm đang hoạt động.</TrongRong> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Tên</th><th>Địa chỉ</th><th>Toạ độ</th><th className="so">Bán kính</th><th className="so">Máy</th><th>Trạng thái</th>{sua && <th />}</tr></thead>
            <tbody>{d.diaDiem.map((x) => (
              <tr key={x.id}>
                <td>{x.ten}</td><td>{x.diaChi ?? ""}</td>
                <td><a href={duongDanBanDo(x.viDo, x.kinhDo)} target="_blank" rel="noopener noreferrer">{x.viDo.toFixed(5)}, {x.kinhDo.toFixed(5)}</a></td>
                <td className="so">{x.banKinhM ? `${x.banKinhM} m` : `${d.ch.banKinhMacDinhM} m (mặc định)`}</td>
                <td className="so">{x.soMay}</td><td><TrangThai giaTri={x.trangThai} /></td>
                {sua && <td><FormNhanh nhanNut="Sửa" tieuDe={`Sửa ${x.ten}`} url={`/api/v1/nhan-su/dia-diem/${x.id}`} phuongThuc="PUT" lopNut="nut nho"
                  truong={[...tDiaDiem, { ten: "trangThai", nhan: "Trạng thái", kieu: "select", luaChon: TRANG_THAI }]}
                  giaTriDau={{ ten: x.ten, diaChi: x.diaChi ?? "", viDo: x.viDo, kinhDo: x.kinhDo, banKinhM: x.banKinhM ?? "", trangThai: x.trangThai }} /></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="the">
        <div className="dau"><h2>Ca làm</h2>{tao && <FormNhanh nhanNut="Thêm ca" tieuDe="Thêm ca làm" url="/api/v1/nhan-su/ca-lam" truong={tCa} lopNut="nut chinh nho" giaTriDau={{ gioVao: "08:00", gioRa: "17:00", gioNghi: "12:00", phutNghi: 60 }} />}</div>
        {d.ca.length === 0 ? <TrongRong tieuDe="Chưa có ca làm" /> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Mã</th><th>Tên</th><th>Giờ</th><th>Nghỉ giữa ca</th><th>Cho phép muộn / sớm</th><th>Trạng thái</th>{sua && <th />}</tr></thead>
            <tbody>{d.ca.map((c) => (
              <tr key={c.id}>
                <td><code>{c.ma}</code></td><td>{c.ten}</td><td>{c.gioVao} – {c.gioRa}{c.quaDem && <span className="huy-hieu chinh"> qua đêm</span>}</td>
                <td>{c.phutNghi ? `${c.gioNghi ?? "giữa ca"} · ${c.phutNghi} phút` : "—"}</td>
                <td>{c.choPhepMuonPhut ?? `${d.ch.choPhepMuonPhut} (mặc định)`} / {c.choPhepSomPhut ?? `${d.ch.choPhepSomPhut} (mặc định)`}</td>
                <td><TrangThai giaTri={c.trangThai} /></td>
                {sua && <td><FormNhanh nhanNut="Sửa" tieuDe={`Sửa ca ${c.ma}`} url={`/api/v1/nhan-su/ca-lam/${c.id}`} phuongThuc="PUT" lopNut="nut nho"
                  truong={[...tCa, { ten: "trangThai", nhan: "Trạng thái", kieu: "select", luaChon: TRANG_THAI }]}
                  giaTriDau={{ ma: c.ma, ten: c.ten, gioVao: c.gioVao, gioRa: c.gioRa, gioNghi: c.gioNghi ?? "", phutNghi: c.phutNghi, choPhepMuonPhut: c.choPhepMuonPhut ?? "", choPhepSomPhut: c.choPhepSomPhut ?? "", trangThai: c.trangThai }} /></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="the">
        <div className="dau">
          <h2>Lịch tuần</h2>
          <span style={{ display: "flex", gap: 6 }}>
            {tao && luaCa.length > 0 && <FormNhanh nhanNut="Thêm lịch" tieuDe="Thêm lịch tuần" url="/api/v1/nhan-su/lich-lam" truong={tLich} lopNut="nut chinh nho" rong={640}
              giaTriDau={{ caId: luaCa[0].giaTri, ngay: ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"] }} />}
            {sua && d.lich.length > 0 && <FormNhanh nhanNut="Gán lịch cho nhân viên" tieuDe="Gán lịch" url="/api/v1/nhan-su/gan-lich" lopNut="nut nho"
              truong={[
                { ten: "lichId", nhan: "Lịch", kieu: "select", luaChon: d.lich.filter((l) => l.trangThai === "hoat-dong").map((l) => ({ giaTri: l.id, nhan: l.ten })), caDong: true },
                { ten: "tuNgay", nhan: "Áp dụng từ ngày", kieu: "date", batBuoc: true },
                { ten: "ghiChu", nhan: "Ghi chú", kieu: "text" },
                { ten: "nguoiIds", nhan: "Nhân viên (giữ Ctrl / ⌘ để chọn nhiều)", kieu: "nhieu", luaChon: d.nguoi.map((n) => ({ giaTri: n.id, nhan: n.fullName })) },
              ]}
              giaTriDau={{ lichId: d.lich.find((l) => l.trangThai === "hoat-dong")?.id ?? "", tuNgay: homNayVN(), nguoiIds: [] }} />}
          </span>
        </div>
        {d.lich.length > 0 && !d.lich.some((l) => l.macDinh && l.trangThai === "hoat-dong") && (
          <div className="hop-thong-bao canh-bao">Chưa chọn <strong>lịch mặc định</strong> — người chưa được gán lịch sẽ không có ngày công dự kiến. Bấm “Đặt làm mặc định” ở lịch dùng chung của công ty (không bắt buộc — phần mềm vẫn chạy).</div>
        )}
        {d.lich.length === 0 ? <TrongRong tieuDe="Chưa có lịch tuần">Tạo ca trước, rồi tạo lịch tuần và gán cho nhân viên.</TrongRong> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Mã</th><th>Tên</th><th>Ca</th>{NGAY.map((n) => <th key={n}>{n}</th>)}<th className="so">Lần gán</th>{sua && <th />}</tr></thead>
            <tbody>{d.lich.map((l) => (
              <tr key={l.id}>
                <td><code>{l.ma}</code></td><td>{l.ten}{l.macDinh && <span className="huy-hieu tot"> Mặc định</span>}</td><td>{l.ca.name}</td>
                {(l.ngay as PhanNgay[]).map((p, i) => <td key={i} className={p === "nghi" ? "phu" : undefined}>{NHAN_PHAN_NGAY[p]}</td>)}
                <td className="so">{l.soLanGan}</td>
                {sua && <td style={{ display: "flex", gap: 6 }}>{l.trangThai === "hoat-dong" && <FormNhanh nhanNut={l.macDinh ? "Áp lại từ ngày…" : "Đặt làm mặc định"} tieuDe={`Lịch mặc định: ${l.ten}`} url={`/api/v1/nhan-su/lich-lam/${l.id}/mac-dinh`} lopNut="nut nho"
                  truong={[{ ten: "tuNgay", nhan: "Áp dụng từ ngày (cho người CHƯA được gán lịch)", kieu: "date", batBuoc: true, goiY: "Chỉ áp từ ngày này trở đi; không đổi tháng đã khóa bảng công. Người đã gán lịch giữ lịch của mình." }]}
                  giaTriDau={{ tuNgay: homNayVN() }} />}<FormNhanh nhanNut="Sửa" tieuDe={`Sửa lịch ${l.ma}`} url={`/api/v1/nhan-su/lich-lam/${l.id}`} phuongThuc="PUT" lopNut="nut nho" rong={640}
                  truong={[...tLich, { ten: "trangThai", nhan: "Trạng thái", kieu: "select", luaChon: TRANG_THAI }]}
                  giaTriDau={{ ma: l.ma, ten: l.ten, caId: l.ca.id, ngay: l.ngay as string[], trangThai: l.trangThai }} /></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="the">
        <div className="dau">
          <h2>Ngày lễ năm {nam}</h2>
          <span style={{ display: "flex", gap: 6 }}>
            <Link className="nut nho" href={`?nam=${nam - 1}`}>‹ {nam - 1}</Link>
            <Link className="nut nho" href={`?nam=${nam + 1}`}>{nam + 1} ›</Link>
            {tao && <FormNhanh nhanNut="Thêm ngày lễ" tieuDe="Thêm ngày lễ / ngày nghỉ chung" url="/api/v1/nhan-su/ngay-le" lopNut="nut chinh nho"
              truong={[{ ten: "ngay", nhan: "Ngày", kieu: "date", batBuoc: true }, { ten: "ten", nhan: "Tên", kieu: "text", batBuoc: true }]} />}
          </span>
        </div>
        <p className="phu nho" style={{ marginTop: 0 }}>Hệ thống không tự điền lịch lễ — Nhân sự nhập theo thông báo nghỉ lễ hằng năm (kể cả ngày nghỉ bù). Ngày lễ không tính vắng mặt, không nhắc chấm công; làm ngày lễ tính tăng ca loại &quot;lễ&quot;.</p>
        {d.ngayLe.length === 0 ? <TrongRong tieuDe="Chưa nhập ngày lễ nào cho năm này" /> : (
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Ngày</th><th>Tên</th><th>Trạng thái</th>{sua && <th />}</tr></thead>
            <tbody>{d.ngayLe.map((h) => (
              <tr key={h.id}>
                <td>{h.ngay.split("-").reverse().join("/")}</td><td>{h.ten}</td><td><TrangThai giaTri={h.trangThai} /></td>
                {sua && <td><FormNhanh nhanNut="Đổi trạng thái" tieuDe={h.ten} url={`/api/v1/nhan-su/ngay-le/${h.id}`} phuongThuc="PUT" lopNut="nut nho"
                  truong={[{ ten: "trangThai", nhan: "Trạng thái", kieu: "select", luaChon: TRANG_THAI }]} giaTriDau={{ trangThai: h.trangThai }} /></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="the">
        <div className="dau"><h2>Loại nghỉ</h2>{tao && <FormNhanh nhanNut="Thêm loại nghỉ" tieuDe="Thêm loại nghỉ" url="/api/v1/nhan-su/loai-nghi" truong={tLoaiNghi} lopNut="nut chinh nho" giaTriDau={{ coLuong: true, truPhepNam: false, thuTu: 100 }} />}</div>
        <p className="phu nho" style={{ marginTop: 0 }}>Quỹ phép năm: {d.ch.phepSoNgayNam} ngày/năm{d.ch.phepThamNienSoNam ? `, +${d.ch.phepThamNienCongNgay} ngày mỗi ${d.ch.phepThamNienSoNam} năm thâm niên` : ""}{d.ch.phepCongDonTheoThang === 1 ? ", tích lũy theo tháng" : ""}, chuyển sang năm sau tối đa {d.ch.phepChuyenNamSauToiDa} ngày (đổi ở Cấu hình).</p>
        <div className="cuon-ngang"><table className="bang">
          <thead><tr><th>Mã</th><th>Tên</th><th>Có lương</th><th>Trừ phép năm</th><th>Trạng thái</th>{sua && <th />}</tr></thead>
          <tbody>{d.loaiNghi.map((l) => (
            <tr key={l.id}>
              <td><code>{l.ma}</code></td><td>{l.ten}</td><td>{l.coLuong ? "Có" : "Không"}</td><td>{l.truPhepNam ? "Có" : "Không"}</td><td><TrangThai giaTri={l.trangThai} /></td>
              {sua && <td><FormNhanh nhanNut="Sửa" tieuDe={`Sửa ${l.ten}`} url={`/api/v1/nhan-su/loai-nghi/${l.id}`} phuongThuc="PUT" lopNut="nut nho"
                truong={[...tLoaiNghi, { ten: "trangThai", nhan: "Trạng thái", kieu: "select", luaChon: TRANG_THAI }]}
                giaTriDau={{ ma: l.ma, ten: l.ten, thuTu: l.thuTu, coLuong: l.coLuong, truPhepNam: l.truPhepNam, trangThai: l.trangThai }} /></td>}
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  );
}
