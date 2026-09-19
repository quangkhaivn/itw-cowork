import Link from "next/link";

export default function KhongTimThay() {
  return (
    <main className="giua">
      <div className="the the-don">
        <h1>Không tìm thấy</h1>
        <p className="phu">Trang hoặc bản ghi này không tồn tại, hoặc bạn không có quyền xem.</p>
        <Link className="nut chinh" href="/bang-dieu-khien">
          Về bảng điều hành
        </Link>
      </div>
    </main>
  );
}
