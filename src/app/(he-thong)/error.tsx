"use client";

import Link from "next/link";

/**
 * Lỗi ngoài dự kiến khi dựng trang. Không hiện chi tiết kỹ thuật cho người dùng —
 * chi tiết nằm trong log máy chủ, tra theo mã `digest`.
 */
export default function LoiTrang({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="the" style={{ maxWidth: 560 }}>
      <div className="than">
        <h1 style={{ marginBottom: 8 }}>Không hiển thị được trang này</h1>
        <p className="phu">
          Hệ thống gặp lỗi khi tải dữ liệu. Thử lại; nếu vẫn lỗi, báo Quản trị hệ thống
          {error.digest ? (
            <>
              {" "}
              kèm mã <code>{error.digest}</code>
            </>
          ) : null}
          .
        </p>
        <div className="hanh-dong">
          <button className="nut chinh" onClick={reset}>
            Thử lại
          </button>
          <Link className="nut" href="/bang-dieu-khien">
            Về bảng điều hành
          </Link>
        </div>
      </div>
    </section>
  );
}
