import Link from "next/link";
import { layMot, yeuCauDangNhap, type ThamSoTrang } from "@/lib/trang";

export const dynamic = "force-dynamic";

export default async function KhongCoQuyen({ searchParams }: { searchParams: ThamSoTrang }) {
  await yeuCauDangNhap();
  const quyen = layMot((await searchParams).quyen).slice(0, 100);
  return (
    <section className="the" style={{ maxWidth: 560 }}>
      <div className="than">
        <h1 style={{ marginBottom: 8 }}>Bạn chưa có quyền xem màn hình này</h1>
        <p className="phu">
          {quyen ? (
            <>
              Cần quyền <code>{quyen}</code>.{" "}
            </>
          ) : null}
          Lần truy cập này đã được ghi lại. Nếu công việc cần, đề nghị Quản trị hệ thống cấp quyền.
        </p>
        <Link className="nut" href="/bang-dieu-khien">
          Về bảng điều hành
        </Link>
      </div>
    </section>
  );
}
