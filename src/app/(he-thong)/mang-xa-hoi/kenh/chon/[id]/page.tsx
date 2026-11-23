import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import ChonKenhOAuth from "@/components/mang-xa-hoi/ChonKenhOAuth";
import { yeuCauQuyen } from "@/lib/trang";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chọn kênh sau khi cấp quyền (0.24.0): chờ máy nền đổi mã (≤ 15 giây), rồi tích chọn Page / Instagram / kênh YouTube. */
export default async function TrangChonKenh({ params }: { params: Promise<{ id: string }> }) {
  await yeuCauQuyen("mxh.update");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  return (
    <>
      <DauTrang tieuDe="Chọn kênh để nối" duongDan={[{ nhan: "Mạng xã hội", href: "/mang-xa-hoi" }, { nhan: "Kênh", href: "/mang-xa-hoi/kenh" }]}
        moTa="Cowork đang lấy danh sách Page / tài khoản Instagram / kênh YouTube bạn quản lý. Chọn kênh muốn nối rồi bấm Lưu — kênh không chọn thì Cowork không giữ quyền." />
      <ChonKenhOAuth id={id} />
    </>
  );
}
