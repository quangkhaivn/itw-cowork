import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { NHAN_MUC_DO } from "@/modules/nhac-viec/quy-tac";
import { xemTuDongHoa } from "@/modules/nhac-viec/service";
import { cacCanhBaoVanHanh, GIO_SAO_LUU_TRE, PHUT_WORKER_TRE } from "@/modules/van-hanh/tinh-toan";
import { CongTacQuyTac, NutChayQuet } from "./TacVuTuDongHoa";

export const dynamic = "force-dynamic";

const NHAN_TRANG_THAI_CHAY: Record<string, { nhan: string; lop: string }> = {
  "dang-chay": { nhan: "Đang chạy", lop: "canh-bao" },
  xong: { nhan: "Xong", lop: "tot" },
  hong: { nhan: "Hỏng", lop: "loi" },
};

/**
 * Màn hình Tự động hóa — bật/tắt quy tắc nhắc việc và xem lịch sử chạy nền.
 *
 * Trang này nói thật: quy tắc nào đang chạy, quy tắc nào **không** chạy và vì sao.
 * Một quy tắc thiếu ngưỡng thì hiện rõ là thiếu, kèm đường tới màn hình Cấu hình —
 * không im lặng bỏ qua rồi để Giám đốc tưởng hệ thống đang canh.
 */
export default async function TrangTuDongHoa() {
  const nd = await yeuCauQuyen("setting.view");
  const kq = await docDuLieu(nd, (tx) => xemTuDongHoa(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));

  const sanSang = kq.quyTac.filter((q) => q.chay).length;
  const nhom = [...new Set(kq.quyTac.map((q) => q.nhom))];
  const vh = kq.vanHanh;
  const canhBao = cacCanhBaoVanHanh(vh, (d) => dinhDangNgayGio(d));
  const tepSaoLuu = typeof vh.saoLuu.info.tep === "string" ? vh.saoLuu.info.tep : null;
  const raNgoai = typeof vh.saoLuu.info.raNgoai === "string" ? vh.saoLuu.info.raNgoai : null;

  return (
    <>
      <DauTrang
        tieuDe="Tự động hóa"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Mỗi sáng hệ thống quét các quy tắc dưới đây rồi lập danh sách Việc hôm nay cho từng người. Quy tắc thiếu ngưỡng thì không chạy — hệ thống không tự chọn con số thay bạn."
        hanhDong={kq.duocSua ? <NutChayQuet /> : undefined}
      />

      {/* 0.16.1 — băng đỏ khi worker đứng, bản quét hỏng hoặc sao lưu quá hạn (QĐ-87, QĐ-88). */}
      {canhBao.map((c) => (
        <div className="hop-thong-bao loi" role="alert" key={c}>
          <strong>Cần xử lý:</strong> {c}
        </div>
      ))}

      <div className="luoi-chi-so">
        <div className={`the chi-so ${vh.worker.trangThai === "ok" ? "" : "loi"}`}>
          <div className="nhan">Tiến trình nền (worker)</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {vh.worker.trangThai === "ok" ? "Đang chạy" : vh.worker.trangThai === "tre" ? "Không báo nhịp" : "Chưa có nhịp"}
          </div>
          <div className="ghi-chu">
            {vh.worker.lanCuoi ? `Nhịp cuối ${dinhDangNgayGio(vh.worker.lanCuoi)}` : "Worker ghi nhịp mỗi phút"} · báo đỏ sau {PHUT_WORKER_TRE} phút
          </div>
        </div>
        <div className={`the chi-so ${vh.saoLuu.trangThai === "ok" ? "" : vh.saoLuu.trangThai === "hong" ? "canh-bao" : "loi"}`}>
          <div className="nhan">Sao lưu thành công gần nhất</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {vh.saoLuu.lanThanhCongCuoi ? dinhDangNgayGio(vh.saoLuu.lanThanhCongCuoi) : "Chưa có"}
          </div>
          <div className="ghi-chu">
            {tepSaoLuu ? `${tepSaoLuu} · ` : ""}
            {raNgoai === "da-chep" ? "đã chép ra ngoài máy" : raNgoai === "chua-cau-hinh" ? "CHƯA chép ra ngoài máy" : `báo đỏ sau ${GIO_SAO_LUU_TRE} giờ`}
            {" · "}
            {vh.thuPhucHoi.lanThanhCongCuoi
              ? `thử phục hồi đạt ${dinhDangNgayGio(vh.thuPhucHoi.lanThanhCongCuoi)}`
              : "chưa thử phục hồi lần nào"}
          </div>
        </div>
      </div>

      <div className="luoi-chi-so">
        <div className={`the chi-so ${sanSang < kq.quyTac.length ? "canh-bao" : ""}`}>
          <div className="nhan">Quy tắc đang canh</div>
          <div className="gia-tri">
            {dinhDangSo(sanSang)} / {dinhDangSo(kq.quyTac.length)}
          </div>
          <div className="ghi-chu">
            {sanSang === kq.quyTac.length ? "Tất cả đều đủ điều kiện chạy" : "Số còn lại đang tắt hoặc thiếu ngưỡng"}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Lần chạy gần nhất</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {kq.lanChay[0] ? dinhDangNgayGio(kq.lanChay[0].batDau) : "—"}
          </div>
          <div className="ghi-chu">
            {kq.lanChay[0]
              ? `${kq.lanChay[0].nguonChay === "tay" ? "Chạy tay" : "Theo lịch"} · ${dinhDangSo(kq.lanChay[0].soViec)} việc`
              : "Chưa chạy lần nào"}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Giờ quét hằng ngày</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            Xem Cấu hình
          </div>
          <div className="ghi-chu">
            <Link href="/quan-tri/cau-hinh">Đặt giờ và các ngưỡng nhắc việc</Link>
          </div>
        </div>
      </div>

      {nhom.map((n) => (
        <section className="the" key={n}>
          <div className="dau">
            <h2>{n}</h2>
          </div>
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Quy tắc</th>
                  <th className="an-tren-dt">Ngưỡng đang dùng</th>
                  <th>Tình trạng</th>
                  <th>Công tắc</th>
                </tr>
              </thead>
              <tbody>
                {kq.quyTac
                  .filter((q) => q.nhom === n)
                  .map((q) => (
                    <tr key={q.ma}>
                      <td>
                        <strong>{q.nhan}</strong>
                        <div className="dong-phu">{q.moTa}</div>
                        <span className={`huy-hieu ${NHAN_MUC_DO[q.mucDo]?.lop ?? ""}`}>
                          {NHAN_MUC_DO[q.mucDo]?.nhan ?? q.mucDo}
                        </span>
                      </td>
                      <td className="an-tren-dt nho">
                        {q.khoaNguong === null ? (
                          <span className="phu">Không cần ngưỡng</span>
                        ) : q.nguong === null ? (
                          <Link href="/quan-tri/cau-hinh" className="chu-loi">
                            Chưa đặt
                          </Link>
                        ) : (
                          dinhDangSo(q.nguong)
                        )}
                      </td>
                      <td className="nho">
                        {q.chay ? (
                          <span className="huy-hieu tot">Đang canh</span>
                        ) : (
                          <>
                            <span className="huy-hieu canh-bao">Không chạy</span>
                            <div className="dong-phu">{q.lyDoBoQua}</div>
                          </>
                        )}
                        {q.lanChayCuoi && <div className="dong-phu phu">Chạy gần nhất {dinhDangNgayGio(q.lanChayCuoi)}</div>}
                      </td>
                      <td>
                        <CongTacQuyTac ma={q.ma} bat={q.bat} duocSua={kq.duocSua} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="the">
        <div className="dau">
          <h2>Lịch sử chạy nền</h2>
        </div>
        {kq.lanChay.length === 0 ? (
          <TrongRong tieuDe="Chưa có lần chạy nào">
            Đặt giờ quét ở Cấu hình để máy tự chạy mỗi sáng, hoặc bấm Chạy quét ngay để thử.
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Ngày quét</th>
                  <th>Nguồn</th>
                  <th>Kết quả</th>
                  <th className="so">Quy tắc</th>
                  <th className="so">Việc</th>
                  <th className="so an-tren-dt">Thông báo</th>
                  <th className="an-tren-dt">Bắt đầu</th>
                </tr>
              </thead>
              <tbody>
                {kq.lanChay.map((l) => (
                  <tr key={l.id}>
                    <td>{dinhDangNgay(l.ngay)}</td>
                    <td className="nho">{l.nguonChay === "tay" ? "Chạy tay" : "Theo lịch"}</td>
                    <td>
                      <span className={`huy-hieu ${NHAN_TRANG_THAI_CHAY[l.trangThai]?.lop ?? ""}`}>
                        {NHAN_TRANG_THAI_CHAY[l.trangThai]?.nhan ?? l.trangThai}
                      </span>
                      {l.loi && <div className="dong-phu chu-loi">{l.loi}</div>}
                    </td>
                    <td className="so nho">
                      {dinhDangSo(l.soQuyTacChay)}
                      {l.soQuyTacBoQua > 0 && <span className="phu"> (+{l.soQuyTacBoQua} bỏ)</span>}
                    </td>
                    <td className="so">{dinhDangSo(l.soViec)}</td>
                    <td className="so an-tren-dt">{dinhDangSo(l.soThongBao)}</td>
                    <td className="an-tren-dt nho">{dinhDangNgayGio(l.batDau)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
