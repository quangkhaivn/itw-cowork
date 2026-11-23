import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import KhungDinhKem from "@/components/dinh-kem/KhungDinhKem";
import FormSoanBai from "@/components/mang-xa-hoi/FormSoanBai";
import ChonTuDrive from "@/components/mang-xa-hoi/ChonTuDrive";
import KenhCuaBai from "@/components/mang-xa-hoi/KenhCuaBai";
import ThaoTacBai from "@/components/mang-xa-hoi/ThaoTacBai";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { chiTietBai, nhatKyDang } from "@/modules/mang-xa-hoi/bai";
import { NHAN_DA_DUYET_CAN_HEN_LAI, NHAN_TRANG_THAI_BAI, type TrangThaiBai } from "@/modules/mang-xa-hoi/hang-so";
import { danhSachKenh } from "@/modules/mang-xa-hoi/kenh";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANH_DONG: Record<string, string> = { "gui-duyet": "Gửi duyệt", rut: "Rút duyệt", duyet: "Duyệt", "tra-lai": "Trả lại" };

export default async function TrangChiTietBai({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("mxh.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const d = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const bai = await chiTietBai(nc, id);
      return { bai, nhatKy: await nhatKyDang(nc, id), kenh: bai.quyen.sua ? await danhSachKenh(nc) : [] };
    } catch (e) {
      if (e instanceof LoiKhongTimThay) return null;
      throw e;
    }
  });
  if (!d) notFound();
  const b = d.bai;
  const n = b.canHenLai ? NHAN_DA_DUYET_CAN_HEN_LAI : NHAN_TRANG_THAI_BAI[b.trangThai as TrangThaiBai] ?? { nhan: b.trangThai, lop: "" };
  return (
    <>
      <DauTrang tieuDe={b.tieuDe ?? "Bài không tiêu đề"} duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }]}
        moTa={<>
          <span className={`huy-hieu ${n.lop}`}>{n.nhan}</span> · Soạn bởi {b.nguoiSoan}{b.doAiTao && " (AI soạn)"}
          {b.henLuc && <> · Hẹn {dinhDangNgayGio(b.henLuc)}</>}
          {b.nguoiDuyet && <> · Duyệt bởi {b.nguoiDuyet} lúc {dinhDangNgayGio(b.duyetLuc)}</>}
        </>} />

      {b.canHenLai && <div className="hop-thong-bao canh-bao">Bài đã được duyệt nhưng giờ hẹn đã trễ quá ngưỡng lúc duyệt — chọn giờ mới (Hẹn giờ) hoặc bấm Đăng ngay.</div>}
      {b.canhBao.map((c) => <div key={c} className="hop-thong-bao canh-bao">{c}</div>)}
      {b.ghiChuDuyet && <div className={`hop-thong-bao ${b.trangThai === "DRAFT" ? "canh-bao" : "thong-tin"}`}>Ghi chú duyệt: {b.ghiChuDuyet}</div>}

      <section className="the">
        <div className="dau"><h2>Kênh</h2></div>
        <div className="than" style={{ padding: 16 }}><KenhCuaBai kenh={b.kenh} /></div>
      </section>

      <ThaoTacBai id={b.id} quyen={b.quyen} phaiDuyet={b.phaiDuyet} />

      {b.quyen.sua ? (
        <FormSoanBai kenh={d.kenh.map((k) => ({ id: k.id, ten: k.ten, tenNenTang: k.tenNenTang, trangThai: k.trangThai, nenTang: k.nenTang, oauth: k.oauth }))} bai={{ id: b.id, tieuDe: b.tieuDe, noiDung: b.noiDung, kenhIds: b.kenh.map((k) => k.kenhId), tuyChon: b.tuyChon }} />
      ) : (
        <section className="the">
          <div className="dau"><h2>Nội dung</h2></div>
          <div className="than" style={{ padding: 16, whiteSpace: "pre-wrap" }}>{b.noiDung}</div>
        </section>
      )}

      {b.quyen.dinhKem ? (
        <>
          <KhungDinhKem loai="social_post" doiTuongId={b.id} moTa="Ảnh (JPEG, PNG, GIF, WebP) và video (MP4, MOV) của bài — tải thẳng tối đa 20 MB; video lớn hơn (tới 200 MB) đặt trên Google Drive rồi chọn ở dưới. Ảnh đầu tiên làm ảnh đại diện WordPress. Media được chụp lại lúc gửi duyệt / đăng; Cowork kiểm định dạng theo từng nền tảng, không chuyển mã video." />
          <ChonTuDrive baiId={b.id} />
        </>
      ) : b.anh.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Ảnh / video đã chụp cho bài</h2></div>
          <ul style={{ padding: "0 32px 16px" }}>{b.anh.map((a) => <li key={a.id}>{a.tenTep} {a.laVideo && <span className="huy-hieu">Video</span>} {a.vaiTro === "featured" && !a.laVideo && <span className="huy-hieu">Ảnh đại diện</span>}</li>)}</ul>
        </section>
      )}

      {b.lichSuDuyet.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Lịch sử duyệt</h2></div>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Lúc</th><th>Người</th><th>Việc</th><th>Ghi chú</th></tr></thead>
            <tbody>{b.lichSuDuyet.map((l, i) => <tr key={i}><td>{dinhDangNgayGio(l.luc)}</td><td>{l.nguoi}</td><td>{HANH_DONG[l.hanhDong] ?? l.hanhDong}</td><td>{l.ghiChu ?? "—"}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}

      {d.nhatKy.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Nhật ký gọi nền tảng</h2><span className="phu nho">Bằng chứng từng lần gọi — không chứa mật khẩu</span></div>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Lúc</th><th>Kênh</th><th className="so">Lượt</th><th>Bước</th><th>Kết quả</th><th className="so">HTTP</th><th>Thông báo</th></tr></thead>
            <tbody>{d.nhatKy.map((a) => <tr key={a.id}><td>{dinhDangNgayGio(a.batDau)}</td><td>{a.kenh}</td><td className="so">{a.lan}</td><td>{a.buoc}</td><td>{a.ketQua}</td><td className="so">{a.http ?? "—"}</td><td className="nho">{a.thongBao ?? ""}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
