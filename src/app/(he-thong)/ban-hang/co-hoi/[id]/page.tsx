import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import GhiTuongTac from "@/components/crm/GhiTuongTac";
import NutTaoViec from "@/components/crm/NutTaoViec";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangNgayGio, dinhDangTien } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc, danhSachNguoiPhuTrach, dateVeNgay, homNayVN, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { LOP_GIAI_DOAN, NHAN_GIAI_DOAN, NHAN_TRANG_THAI_VIEC, NHAN_TUONG_TAC, NHAN_UU_TIEN, laCoHoiDangMo } from "@/modules/crm/hang-so";
import { chiTietCoHoi } from "@/modules/co-hoi/service";
import { dieuKienXemBaoGia } from "@/modules/bao-gia/service";
import { LOP_TRANG_THAI_BAO_GIA, NHAN_TRANG_THAI_BAO_GIA } from "@/modules/bao-gia/tinh-toan";
import { coQuyen } from "@/lib/phan-quyen";
import FormCoHoi from "../FormCoHoi";
import ThanhGiaiDoan from "./ThanhGiaiDoan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangChiTietCoHoi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("sales.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const sp = await searchParams;
  const moTao = layMot(sp.moTao) === "1";
  const tuLead = layMot(sp.tuLead) === "1";

  const duLieu = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const d = await chiTietCoHoi(nc, id);
      const luaChon = await luaChonDuLieuGoc(nc, ["nguon_lead", "ly_do_thua"]);
      const tenDuLieu = await banDoTenDuLieuGoc(nc, ["nguon_lead", "ly_do_thua"]);
      const nguoiSua = d.quyen.sua ? await danhSachNguoiPhuTrach(nc, "sales.update") : [];
      const nguoiViec = d.quyen.taoViec ? await danhSachNguoiPhuTrach(nc, "task.create") : [];
      const lienHe = (
        await tx.contact.findMany({
          where: { customerId: d.coHoi.khachHang.id, status: "hoat-dong" },
          select: { id: true, fullName: true },
          orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }],
        })
      ).map((l) => ({ id: l.id, hoTen: l.fullName }));
      // Chuỗi Cơ hội → Báo giá: xem ngay ở đây, không phải sang màn khác (mục 6 prompt).
      const baoGia = coQuyen(nd.hoSo, "quotation.view")
        ? await tx.quotation.findMany({
            where: { AND: [{ opportunityId: id }, await dieuKienXemBaoGia(nc)] },
            select: { id: true, number: true, status: true, currentVersion: { select: { versionNo: true, total: true } } },
            orderBy: { createdAt: "desc" },
          })
        : [];
      return { ...d, luaChon, tenDuLieu, nguoiSua, nguoiViec, lienHe, baoGia };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!duLieu) notFound();
  const { coHoi, tuongTac, viec, leadGoc, quyen, luaChon, tenDuLieu, nguoiSua, nguoiViec, lienHe, baoGia } = duLieu;
  const dangMo = laCoHoiDangMo(coHoi.giaiDoan);
  const quaHan = dangMo && coHoi.ngayHanhDong && dateVeNgay(coHoi.ngayHanhDong) < homNayVN();

  return (
    <>
      <DauTrang
        tieuDe={coHoi.tieuDe}
        duongDan={[{ nhan: "Bán hàng" }, { nhan: "Cơ hội", href: "/ban-hang/co-hoi" }]}
        moTa={
          <>
            {coHoi.ma} · <Link href={`/crm/khach-hang/${coHoi.khachHang.id}`}>{coHoi.khachHang.ten}</Link> · Phụ trách: {coHoi.nguoiPhuTrach.hoTen}
            {leadGoc && (
              <>
                {" "}· Từ lead <Link href={`/crm/lead/${leadGoc.id}`}>{leadGoc.code}</Link>
              </>
            )}
          </>
        }
        hanhDong={
          <>
            {coQuyen(nd.hoSo, "quotation.create") && dangMo && (
              <Link className="nut" href={`/ban-hang/bao-gia/moi?coHoi=${coHoi.id}`}>
                Lập báo giá
              </Link>
            )}
            {quyen.taoViec && <NutTaoViec ganKem={{ coHoiId: coHoi.id }} nguoiPhuTrach={nguoiViec} toiId={nd.hoSo.userId} />}
          </>
        }
      />

      {moTao && <div className="hop-thong-bao tot" role="status">Đã tạo cơ hội {coHoi.ma}.</div>}
      {tuLead && <div className="hop-thong-bao tot" role="status">Đã chuyển đổi lead thành khách hàng và cơ hội {coHoi.ma}.</div>}

      <section className="the" style={{ marginBottom: 16 }}>
        <div className="than">
          <ThanhGiaiDoan
            coHoiId={coHoi.id}
            tieuDe={coHoi.tieuDe}
            giaiDoan={coHoi.giaiDoan}
            duocSua={quyen.sua}
            duocMoLai={quyen.moLai}
            lyDoThua={luaChon.ly_do_thua}
          />
          <div className="luoi-chi-so" style={{ marginTop: 14, marginBottom: 0 }}>
            <div className="chi-so">
              <div className="nhan">Giá trị ước tính</div>
              <div className="gia-tri">{dinhDangTien(coHoi.giaTri)}</div>
            </div>
            <div className="chi-so">
              <div className="nhan">Xác suất · có trọng số</div>
              <div className="gia-tri">{coHoi.xacSuat}%</div>
              <div className="ghi-chu">{dinhDangTien((Number(coHoi.giaTri) * coHoi.xacSuat) / 100)}</div>
            </div>
            <div className={`chi-so ${quaHan ? "loi" : ""}`}>
              <div className="nhan">Hành động kế tiếp</div>
              <div className="gia-tri" style={{ fontSize: 15 }}>{coHoi.hanhDongKeTiep ?? "—"}</div>
              <div className="ghi-chu">{coHoi.ngayHanhDong ? `${dinhDangNgay(coHoi.ngayHanhDong)}${quaHan ? " — đã quá hạn" : ""}` : "—"}</div>
            </div>
            <div className="chi-so">
              <div className="nhan">Dự kiến chốt</div>
              <div className="gia-tri" style={{ fontSize: 15 }}>{coHoi.ngayDuKienChot ? dinhDangNgay(coHoi.ngayDuKienChot) : "—"}</div>
            </div>
          </div>
          {coHoi.giaiDoan === "LOST" && (
            <div className="hop-thong-bao loi" style={{ marginTop: 12, marginBottom: 0 }}>
              Thua — lý do: {coHoi.lyDoThua ? (tenDuLieu.ly_do_thua[coHoi.lyDoThua] ?? coHoi.lyDoThua) : "—"}
              {coHoi.ghiChuThua && ` · ${coHoi.ghiChuThua}`} · đóng lúc {dinhDangNgayGio(coHoi.dongLuc)}
            </div>
          )}
          {coHoi.giaiDoan === "WON" && (
            <div className="hop-thong-bao tot" style={{ marginTop: 12, marginBottom: 0 }}>
              Thắng — đóng lúc {dinhDangNgayGio(coHoi.dongLuc)}. Báo giá và đơn hàng sẽ nối vào đây khi Phase 4–5 chạy.
            </div>
          )}
        </div>
      </section>

      <div className="luoi-ben-phai">
        <div>
          {quyen.sua && dangMo ? (
            <FormCoHoi
              nguon={luaChon.nguon_lead}
              nguoiPhuTrach={nguoiSua}
              lienHeBanDau={lienHe}
              banDau={{
                id: coHoi.id,
                khachHang: coHoi.khachHang,
                lienHeId: coHoi.lienHe?.id ?? "",
                tieuDe: coHoi.tieuDe,
                moTa: coHoi.moTa ?? "",
                giaTri: String(Math.round(Number(coHoi.giaTri))),
                xacSuat: String(coHoi.xacSuat),
                ngayDuKienChot: dateVeNgay(coHoi.ngayDuKienChot),
                nguon: coHoi.nguon ?? "",
                nguoiPhuTrachId: coHoi.nguoiPhuTrach.id,
                hanhDongKeTiep: coHoi.hanhDongKeTiep ?? "",
                ngayHanhDong: dateVeNgay(coHoi.ngayHanhDong),
                doiThu: coHoi.doiThu ?? "",
              }}
            />
          ) : (
            <section className="the">
              <div className="dau">
                <h2>Thông tin</h2>
              </div>
              <dl className="bang-thong-tin">
                <dt>Người liên hệ</dt>
                <dd>{coHoi.lienHe ? `${coHoi.lienHe.hoTen}${coHoi.lienHe.dienThoai ? ` · ${coHoi.lienHe.dienThoai}` : ""}` : "—"}</dd>
                <dt>Nguồn</dt>
                <dd>{coHoi.nguon ? (tenDuLieu.nguon_lead[coHoi.nguon] ?? coHoi.nguon) : "—"}</dd>
                <dt>Đối thủ</dt>
                <dd>{coHoi.doiThu ?? "—"}</dd>
                <dt>Mô tả</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{coHoi.moTa ?? "—"}</dd>
                <dt>Tạo lúc</dt>
                <dd>{dinhDangNgayGio(coHoi.taoLuc)}</dd>
              </dl>
            </section>
          )}

          {baoGia.length > 0 && (
            <section className="the">
              <div className="dau">
                <h2>Báo giá</h2>
                {coQuyen(nd.hoSo, "quotation.create") && dangMo && (
                  <Link className="nut nho" href={`/ban-hang/bao-gia/moi?coHoi=${coHoi.id}`}>
                    Lập báo giá
                  </Link>
                )}
              </div>
              <table className="bang">
                <thead>
                  <tr>
                    <th>Số báo giá</th>
                    <th>Trạng thái</th>
                    <th className="so">Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {baoGia.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/ban-hang/bao-gia/${b.id}`}>{b.number}</Link>
                        {b.currentVersion && <div className="dong-phu">Phiên bản V{b.currentVersion.versionNo}</div>}
                      </td>
                      <td>
                        <span className={`huy-hieu ${LOP_TRANG_THAI_BAO_GIA[b.status] ?? ""}`}>{NHAN_TRANG_THAI_BAO_GIA[b.status] ?? b.status}</span>
                      </td>
                      <td className="so">{b.currentVersion ? dinhDangTien(b.currentVersion.total.toString()) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="the">
            <div className="dau">
              <h2>Tương tác</h2>
            </div>
            {quyen.ghiTuongTac && (
              <div className="than" style={{ borderBottom: "1px solid var(--vien)" }}>
                <GhiTuongTac coHoiId={coHoi.id} lienHe={lienHe} />
              </div>
            )}
            {tuongTac.length === 0 ? (
              <TrongRong tieuDe="Chưa có tương tác nào về cơ hội này" />
            ) : (
              <ul className="ds-tuong-tac">
                {tuongTac.map((t) => (
                  <li key={t.id}>
                    <div className="dau-dong">
                      <span className="huy-hieu">{NHAN_TUONG_TAC[t.loai] ?? t.loai}</span>
                      <strong>{t.tieuDe}</strong>
                      <span className="phu">
                        {dinhDangNgayGio(t.luc)} · {t.nguoi}
                        {t.lienHe && ` · với ${t.lienHe}`}
                      </span>
                    </div>
                    {t.noiDung && <p>{t.noiDung}</p>}
                    {t.ketQua && <p className="phu">Kết quả: {t.ketQua}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div>
          <section className="the">
            <div className="dau">
              <h2>Công việc</h2>
            </div>
            {viec.length === 0 ? (
              <div className="than phu">Chưa có công việc.</div>
            ) : (
              <table className="bang">
                <tbody>
                  {viec.map((v) => (
                    <tr key={v.id} className={v.trangThai === "xong" || v.trangThai === "huy" ? "mo" : undefined}>
                      <td>
                        <Link href={`/cong-viec?id=${v.id}`}>{v.tieuDe}</Link>
                        <div className="dong-phu">
                          {v.nguoi} · {NHAN_UU_TIEN[v.uuTien]} · {v.han ? dinhDangNgayGio(v.han) : "không hạn"}
                        </div>
                      </td>
                      <td>
                        <span className="huy-hieu">{NHAN_TRANG_THAI_VIEC[v.trangThai]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="the">
            <div className="dau">
              <h2>Giai đoạn</h2>
            </div>
            <div className="than">
              <span className={`huy-hieu ${LOP_GIAI_DOAN[coHoi.giaiDoan] ?? ""}`}>{NHAN_GIAI_DOAN[coHoi.giaiDoan]}</span>
              <p className="phu" style={{ marginTop: 8, marginBottom: 0 }}>
                Cập nhật lần cuối {dinhDangNgayGio(coHoi.suaLuc)}. Lịch sử đổi giai đoạn nằm trong Nhật ký kiểm toán.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
