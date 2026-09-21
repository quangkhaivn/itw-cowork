import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgay, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauMotTrongCacQuyen, type ThamSoTrang } from "@/lib/trang";
import { chiTietTraHangBan } from "@/modules/tra-hang/service";
import {
  LOP_TRANG_THAI_TRA_HANG,
  NHAN_LOAI_TRA_HANG,
  NHAN_TINH_TRANG_HANG,
  NHAN_TRANG_THAI_TRA_BAN,
} from "@/modules/tra-hang/tinh-toan";
import TacVuTraHangBan from "./TacVuTraHangBan";

export const dynamic = "force-dynamic";

const QUYEN_XEM = ["order.view", "service_desk.view", "finance.view"];

export default async function TrangChiTietKhachTra({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: ThamSoTrang;
}) {
  const nd = await yeuCauMotTrongCacQuyen(QUYEN_XEM);
  const { id } = await params;
  const sp = await searchParams;

  const du = await docDuLieu(nd, async (tx) => {
    try {
      return await chiTietTraHangBan(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo), id);
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const p = du.phieu;
  const moTao = layMot(sp.moTao) === "1";
  const doiMay = p.loai === "doi-may";

  return (
    <>
      <DauTrang
        tieuDe={p.so}
        duongDan={[{ nhan: "Trả hàng" }, { nhan: "Khách trả hàng", href: "/tra-hang/khach-tra" }]}
        moTa={
          <>
            {NHAN_LOAI_TRA_HANG[p.loai] ?? p.loai} · {p.khachHang.ten}
            {p.donHang && (
              <>
                {" · theo đơn "}
                <Link href={`/ban-hang/don-hang/${p.donHang.id}`}>{p.donHang.so}</Link>
              </>
            )}
            {" · Kho "}
            {p.kho.ten}
          </>
        }
        hanhDong={
          <TacVuTraHangBan
            id={p.id}
            so={p.so}
            khachHangId={p.khachHang.id}
            tongCong={Number(p.tongCong)}
            duocXacNhan={du.quyen.xacNhan}
            duocChotTien={du.quyen.chotTien}
            duocHuy={du.quyen.huy}
          />
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã lập phiếu {p.so}. Khi hàng thật sự về kho, thủ kho bấm “Xác nhận nhận lại hàng”.
        </div>
      )}

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Trạng thái</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            <span className={`huy-hieu ${LOP_TRANG_THAI_TRA_HANG[p.trangThai] ?? ""}`}>
              {NHAN_TRANG_THAI_TRA_BAN[p.trangThai] ?? p.trangThai}
            </span>
          </div>
          {p.lyDoHuy && <div className="ghi-chu chu-loi">Lý do hủy: {p.lyDoHuy}</div>}
        </div>
        <div className="the chi-so">
          <div className="nhan">{doiMay ? "Tiền phát sinh" : "Giá trị hàng trả"}</div>
          <div className="gia-tri">{doiMay ? "0 ₫" : dinhDangTien(p.tongCong)}</div>
          <div className="ghi-chu">
            {doiMay
              ? "Đổi ngang — chênh lệch giá phải đi bằng chứng từ khác"
              : `Tạm tính ${dinhDangTien(p.tamTinh)} · VAT ${dinhDangTien(p.tongVat)}`}
          </div>
        </div>
        {!doiMay && (
          <div className={`the chi-so ${p.conGiamTruDuoc > 0 && p.trangThai === "CONFIRMED" ? "canh-bao" : ""}`}>
            <div className="nhan">Đã giảm trừ công nợ</div>
            <div className="gia-tri">{dinhDangTien(p.daGiamTru)}</div>
            <div className="ghi-chu">
              {p.conGiamTruDuoc > 0 ? `Còn ${dinhDangTien(p.conGiamTruDuoc)} chưa trừ vào hóa đơn nào` : "Đã trừ hết"}
            </div>
          </div>
        )}
        <div className="the chi-so">
          <div className="nhan">Ngày trả</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {dinhDangNgay(p.ngayTra)}
          </div>
          <div className="ghi-chu">Người lập: {p.nguoiPhuTrach.hoTen}</div>
        </div>
      </div>

      <section className="the">
        <div className="dau">
          <h2>Vì sao trả</h2>
        </div>
        <div className="than">
          <p style={{ margin: 0 }}>{p.lyDo}</p>
          {p.ghiChu && <p className="phu" style={{ marginBottom: 0 }}>{p.ghiChu}</p>}
        </div>
      </section>

      <section className="the">
        <div className="dau">
          <h2>{doiMay ? "Máy đổi" : "Hàng khách trả"}</h2>
        </div>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Hàng</th>
                <th className="so">SL</th>
                <th>Tình trạng</th>
                <th className="an-tren-dt">Vào kho</th>
                {!doiMay && <th className="so">Thành tiền</th>}
                {doiMay && <th>Giao thay thế</th>}
              </tr>
            </thead>
            <tbody>
              {p.dong.map((d) => (
                <tr key={d.id}>
                  <td className="so nho">{d.thuTu}</td>
                  <td>
                    <strong>{d.ten}</strong>
                    {d.sku && <div className="dong-phu">{d.sku}</div>}
                    {d.daGiaoTrenDon && <div className="dong-phu phu">Đơn đã giao {d.daGiaoTrenDon}</div>}
                    {d.serial.length > 0 && (
                      <div className="dong-phu">Sê-ri: {d.serial.map((s) => s.serial).join(", ")}</div>
                    )}
                  </td>
                  <td className="so">
                    {d.soLuong}
                    {d.donViTinh ? ` ${d.donViTinh}` : ""}
                  </td>
                  <td>
                    <span className={`huy-hieu ${NHAN_TINH_TRANG_HANG[d.tinhTrang]?.lop ?? ""}`}>
                      {NHAN_TINH_TRANG_HANG[d.tinhTrang]?.nhan ?? d.tinhTrang}
                    </span>
                  </td>
                  <td className="an-tren-dt nho">
                    {!d.quanLyTon ? (
                      <span className="phu">Không quản lý tồn</span>
                    ) : d.nhapLaiKho ? (
                      "Cộng lại tồn"
                    ) : (
                      <span className="chu-loi">Không nhập lại</span>
                    )}
                    {d.ghiChu && <div className="dong-phu phu">{d.ghiChu}</div>}
                  </td>
                  {!doiMay && <td className="so">{dinhDangTien(d.thanhTien)}</td>}
                  {doiMay && (
                    <td className="nho">
                      {d.hangThayThe ? (
                        <>
                          <strong>{d.hangThayThe.ten}</strong>
                          {d.hangThayThe.sku && <div className="dong-phu">{d.hangThayThe.sku}</div>}
                        </>
                      ) : (
                        <span className="phu">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!doiMay && (
        <section className="the">
          <div className="dau">
            <h2>Giảm trừ vào hóa đơn</h2>
          </div>
          {p.giamTru.length === 0 ? (
            <TrongRong tieuDe="Chưa giảm trừ vào hóa đơn nào">
              {p.trangThai === "CONFIRMED"
                ? "Hàng đã về kho. Kế toán bấm “Chốt tiền — giảm trừ công nợ” để trừ giá trị này vào hóa đơn khách đang nợ."
                : "Phiếu phải qua bước nhận lại hàng trước khi chốt tiền."}
            </TrongRong>
          ) : (
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th>Hóa đơn</th>
                    <th className="so">Số tiền giảm trừ</th>
                  </tr>
                </thead>
                <tbody>
                  {p.giamTru.map((g) => (
                    <tr key={g.hoaDonId}>
                      <td>
                        <Link href={`/tai-chinh/hoa-don/${g.hoaDonId}`}>{g.soHoaDon}</Link>
                      </td>
                      <td className="so">{dinhDangTien(g.soTien)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
