import { redirect } from "next/navigation";

/** 0.22.0: màn hình Máy chấm công chuyển sang /may-cham-cong (menu riêng cho Kỹ thuật, QĐ-176). */
export default function TrangCu() {
  redirect("/may-cham-cong");
}
