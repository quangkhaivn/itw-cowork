import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import KhungDinhKem from "@/components/dinh-kem/KhungDinhKem";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { NHAN_DANH_GIA_KET_QUA, NHAN_TRANG_THAI_VIEC, NHAN_UU_TIEN } from "@/modules/crm/hang-so";
import { chiTietViec } from "@/modules/cong-viec/service";
import TacVuChiTietViec from "./TacVuChiTietViec";
import DanhSachKiemTra from "./DanhSachKiemTra";

export const dynamic = "force-dynamic";

const LOP_TRANG_THAI: Record<string, string> = { mo: "", "dang-lam": "chinh", xong: "tot", huy: "" };
const LOP_DANH_GIA: Record<string, string> = { dat: "tot", "mot-phan": "canh-bao", "khong-dat": "loi", "can-theo-doi": "chinh" };
const LOP_UU_TIEN: Record<string, string> = { khan: "loi", cao: "canh-bao", "trung-binh": "", thap: "" };

/**
 * Một công việc: ai giao, giao lúc nào, việc gì, kết quả ra sao (0.17.0 — CV-04 → CV-10).
 * Đây là nơi thông báo "được giao việc" và "việc đã xong" dẫn tới.
 */
export default async function TrangChiTietViec({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("task.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietViec(nc, id);
      const nguoiGiaoLai = ct.quyen.giaoLai ? await danhSachNguoiPhuTrach(nc, "task.update") : [];
      return { ...ct, nguoiGiaoLai };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const v = du.viec;
  const chuaXong = v.trangThai === "mo" || v.trangThai === "dang-lam";
  const tiepTheoId = layMot(sp.tiepTheo);

  return (
    <>
      <DauTrang
        tieuDe={v.tieuDe}
        duongDan={[{ nhan: "Công việc", href: "/cong-viec" }]}
        moTa={
          <>
            <span className={`huy-hieu ${LOP_TRANG_THAI[v.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_VIEC[v.trangThai]}</span>{" "}
            {v.uuTien !== "trung-binh" && <span className={`huy-hieu ${LOP_UU_TIEN[v.uuTien]}`}>{NHAN_UU_TIEN[v.uuTien]}</span>}{" "}
            Người làm: <strong>{v.nguoiPhuTrach.hoTen}</strong>
            {v.nguoiGiao && v.nguoiGiao.id !== v.nguoiPhuTrach.id && <> · Người giao: {v.nguoiGiao.hoTen}</>}
          </>
        }
        hanhDong={
          du.quyen.sua && (
            <TacVuChiTietViec
              id={v.id}
              tieuDe={v.tieuDe}
              trangThai={v.trangThai}
              ketQua={v.ketQua}
              danhGia={v.danhGia}
              nguoiPhuTrachId={v.nguoiPhuTrach.id}
              nguoiGiaoLai={du.nguoiGiaoLai.map((n) => ({ id: n.id, hoTen: n.fullName }))}
              kiemTraBanDau={du.kiemTra}
              moHoanThanh={layMot(sp.hoanThanh) === "1" && chuaXong}
            />
          )
        }
      />

      {layMot(sp.daXong) === "1" && v.trangThai === "xong" && (
        <div className="hop-thong-bao tot" role="status">
          Đã ghi kết quả và đánh dấu xong.
          {v.nguoiGiao && v.nguoiGiao.id !== v.nguoiPhuTrach.id && <> {v.nguoiGiao.hoTen} đã nhận được thông báo.</>}
          {tiepTheoId && /^[0-9a-f-]{36}$/i.test(tiepTheoId) && (
            <>
              {" "}
              <Link href={`/cong-viec/${tiepTheoId}`}>Mở việc tiếp theo đã hẹn</Link>
            </>
          )}
        </div>
      )}

      {v.trangThai === "xong" && !v.ketQua && (
        <div className="hop-thong-bao canh-bao" role="status">
          Việc này xong từ trước khi có luật ghi kết quả. Bấm “Ghi kết quả” để bổ sung — người sau mở hồ sơ khách sẽ biết lần đó đã làm gì.
        </div>
      )}

      {chuaXong && v.quaHan && (
        <div className="hop-thong-bao loi" role="status">
          Việc đã quá hạn ({dinhDangNgayGio(v.han)}). Làm ngay, hoặc dời hạn và báo người giao.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Giao lúc</div>
          <div className="gia-tri" style={{ fontSize: 16 }}>
            {dinhDangNgayGio(v.giaoLuc)}
          </div>
          <div className="ghi-chu">{v.nguoiGiao ? `bởi ${v.nguoiGiao.hoTen}` : "Hệ thống tự tạo"}</div>
        </div>
        <div className={`the chi-so ${v.quaHan ? "loi" : ""}`}>
          <div className="nhan">Hạn</div>
          <div className="gia-tri" style={{ fontSize: 16 }}>
            {v.han ? dinhDangNgayGio(v.han) : "Không hạn"}
          </div>
          <div className="ghi-chu">{v.xongLuc ? `Xong ${dinhDangNgayGio(v.xongLuc)}` : v.quaHan ? "Quá hạn" : "Chưa xong"}</div>
        </div>
        <div className={`the chi-so ${v.kiemTra.batBuocConThieu ? "canh-bao" : ""}`}>
          <div className="nhan">Danh sách kiểm tra</div>
          <div className="gia-tri">{v.kiemTra.tong ? `${v.kiemTra.daTich}/${v.kiemTra.tong}` : "—"}</div>
          <div className="ghi-chu">
            {v.kiemTra.tong === 0 ? "Không có mục nào" : v.kiemTra.batBuocConThieu ? `Còn ${v.kiemTra.batBuocConThieu} mục bắt buộc` : "Đủ mục bắt buộc"}
          </div>
        </div>
        {du.hoSoKhach && (
          <div className={`the chi-so ${du.hoSoKhach.thieuBatBuoc.length ? "canh-bao" : ""}`}>
            <div className="nhan">Hồ sơ khách</div>
            <div className="gia-tri">{du.hoSoKhach.diem}%</div>
            <div className="ghi-chu">{du.hoSoKhach.thieuBatBuoc.length ? `Thiếu: ${du.hoSoKhach.thieuBatBuoc.join(", ")}` : "Đủ thông tin bắt buộc"}</div>
          </div>
        )}
      </div>

      <div className="luoi-the">
        <section className="the">
          <div className="dau">
            <h2>Việc cần làm</h2>
          </div>
          <dl className="bang-thong-tin">
            <dt>Mô tả</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{v.moTa || <span className="phu">Không có ghi chú</span>}</dd>
            <dt>Khách hàng</dt>
            <dd>{v.khachHang ? <Link href={`/crm/khach-hang/${v.khachHang.id}`}>{v.khachHang.ten}</Link> : "—"}</dd>
            {v.lead && (
              <>
                <dt>Lead</dt>
                <dd>
                  <Link href={`/crm/lead/${v.lead.id}`}>{v.lead.ma}</Link> <span className="phu">{v.lead.ten}</span>
                </dd>
              </>
            )}
            {v.coHoi && (
              <>
                <dt>Cơ hội</dt>
                <dd>
                  <Link href={`/ban-hang/co-hoi/${v.coHoi.id}`}>{v.coHoi.ma}</Link> <span className="phu">{v.coHoi.ten}</span>
                </dd>
              </>
            )}
            <dt>Tạo lúc</dt>
            <dd>{dinhDangNgayGio(v.taoLuc)}</dd>
          </dl>
        </section>

        <section className="the">
          <div className="dau">
            <h2>Kết quả</h2>
            {v.danhGia && <span className={`huy-hieu ${LOP_DANH_GIA[v.danhGia] ?? ""}`}>{NHAN_DANH_GIA_KET_QUA[v.danhGia]}</span>}
          </div>
          <div className="than">
            {v.ketQua ? (
              <>
                <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{v.ketQua}</p>
                <p className="phu nho" style={{ marginBottom: 0 }}>
                  Ghi bởi {v.nguoiGhiKetQua?.hoTen ?? "—"} lúc {dinhDangNgayGio(v.ketQuaLuc)}
                </p>
              </>
            ) : (
              <p className="phu" style={{ margin: 0 }}>
                Chưa có kết quả. Khi xong việc, ghi lại đã làm gì, khách nói gì và bước tiếp theo — kết quả hiện luôn trên hồ sơ khách.
              </p>
            )}
          </div>
        </section>
      </div>

      <DanhSachKiemTra
        taskId={v.id}
        muc={du.mucKiemTra.map((m) => ({ ...m, tichLuc: m.tichLuc ? m.tichLuc.toISOString() : null }))}
        suaDuoc={du.quyen.sua && chuaXong}
        khoaVi={chuaXong ? null : v.trangThai === "xong" ? "Việc đã xong" : "Việc đã hủy"}
      />

      <KhungDinhKem loai="task" doiTuongId={v.id} moTa="Biên bản nghiệm thu, ảnh hiện trường, tệp khách gửi — bằng chứng cho kết quả công việc." />
    </>
  );
}
