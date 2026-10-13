"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import TrongRong from "@/components/ui/TrongRong";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

interface Nhom {
  id: string;
  ten: string;
  mau: string;
  moTa: string | null;
  trangThai: string;
  soKhach: number;
}

const RONG = { ten: "", mau: "#2563EB", moTa: "" };

/** Danh mục nhóm khách: tạo / sửa / ngừng dùng — chỉ quản lý (`customer.approve`). */
export default function QuanLyNhom({ nhom, quanLy }: { nhom: Nhom[]; quanLy: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [dangSua, datDangSua] = useState<string | "moi" | null>(null);
  const [gt, datGt] = useState(RONG);

  async function luu() {
    const r = dangSua === "moi" ? await goi("/api/v1/nhom-khach", "POST", gt) : await goi(`/api/v1/nhom-khach/${dangSua}`, "PATCH", gt);
    if (r) {
      datDangSua(null);
      datGt(RONG);
      router.refresh();
    }
  }

  const form = (
    <div className="bo-loc" style={{ width: "100%", borderBottom: 0, padding: 0 }}>
      <div className="truong rong">
        <label htmlFor="nk-ten">Tên nhóm</label>
        <input id="nk-ten" value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} maxLength={100} />
      </div>
      <div className="truong">
        <label htmlFor="nk-mau">Màu</label>
        <input id="nk-mau" type="color" value={gt.mau} onChange={(e) => datGt({ ...gt, mau: e.target.value })} />
      </div>
      <div className="truong rong">
        <label htmlFor="nk-mo-ta">Mô tả</label>
        <input id="nk-mo-ta" value={gt.moTa} onChange={(e) => datGt({ ...gt, moTa: e.target.value })} maxLength={1000} />
      </div>
      <button type="button" className="nut chinh" onClick={luu} disabled={dangGui || !gt.ten.trim()}>
        Lưu
      </button>
      <button type="button" className="nut trong" onClick={() => datDangSua(null)}>
        Hủy
      </button>
    </div>
  );

  return (
    <>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: "12px 16px" }}>
          {loi.thongBao}
        </div>
      )}
      {nhom.length === 0 && dangSua !== "moi" && <TrongRong tieuDe="Chưa có nhóm khách nào">{quanLy ? "Bấm “Thêm nhóm” để tạo nhóm đầu tiên." : "Quản lý kinh doanh tạo nhóm."}</TrongRong>}
      <ul className="ds-keo">
        {nhom.map((g) => (
          <li key={g.id} className={g.trangThai !== "hoat-dong" ? "mo" : undefined}>
            {dangSua === g.id ? (
              form
            ) : (
              <>
                <span className="cham-mau" style={{ "--mau": g.mau, width: 14, height: 14 } as React.CSSProperties} />
                <div className="thong-tin">
                  <strong>{g.ten}</strong> {g.trangThai !== "hoat-dong" && <span className="huy-hieu">Ngừng dùng</span>}
                  {g.moTa && <div className="dong-phu">{g.moTa}</div>}
                </div>
                <Link href={`/crm/khach-hang?xem=tat-ca&nhom=${g.id}`}>{dinhDangSo(g.soKhach)} khách</Link>
                {quanLy && (
                  <span className="tac-vu">
                    <button
                      type="button"
                      className="nut nho"
                      onClick={() => {
                        datDangSua(g.id);
                        datGt({ ten: g.ten, mau: g.mau, moTa: g.moTa ?? "" });
                      }}
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      className="nut nho trong"
                      disabled={dangGui}
                      onClick={async () => {
                        if (await goi(`/api/v1/nhom-khach/${g.id}`, "PATCH", { trangThai: g.trangThai === "hoat-dong" ? "ngung-hoat-dong" : "hoat-dong" })) router.refresh();
                      }}
                    >
                      {g.trangThai === "hoat-dong" ? "Ngừng dùng" : "Dùng lại"}
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
        {quanLy && (
          <li>
            {dangSua === "moi" ? (
              form
            ) : (
              <button
                type="button"
                className="nut nho"
                onClick={() => {
                  datGt(RONG);
                  datDangSua("moi");
                }}
              >
                + Thêm nhóm
              </button>
            )}
          </li>
        )}
      </ul>
    </>
  );
}
