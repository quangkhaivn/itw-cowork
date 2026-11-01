"use client";

import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

export default function GiaiQuyet({ id }: { id: string }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  return (
    <>
      <button
        type="button"
        className="nut nho"
        disabled={dangGui}
        onClick={async () => {
          const giaiQuyet = window.prompt("Cách giải quyết (nhân viên sẽ nhận được):");
          if (!giaiQuyet) return;
          if (await goi(`/api/v1/cham-cong/phan-hoi-cong/${id}`, "POST", { giaiQuyet })) router.refresh();
        }}
      >
        Giải quyết
      </button>
      {loi && <div className="chu-loi nho">{loi.thongBao}</div>}
    </>
  );
}
