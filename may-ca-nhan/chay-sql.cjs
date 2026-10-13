// Chạy một tệp SQL (hoặc một câu SQL) bằng thư viện `pg` có sẵn trong node_modules của dự án.
// Dùng cho bộ cài không Docker (cai-nhanh.ps1): máy cá nhân không có psql.
//   node may-ca-nhan/chay-sql.cjs <chuỗi kết nối> --tep <tệp.sql>
//   node may-ca-nhan/chay-sql.cjs <chuỗi kết nối> --cau "<câu SQL>"
//   node may-ca-nhan/chay-sql.cjs <chuỗi kết nối> --dem "<câu SELECT>"   (in ra số dòng trả về)
const fs = require("fs");
const { Client } = require("pg");

(async () => {
  const [ketNoi, kieu, giaTri] = process.argv.slice(2);
  if (!ketNoi || !giaTri || !["--tep", "--cau", "--dem"].includes(kieu)) {
    console.error("Cách dùng: node chay-sql.cjs <chuỗi kết nối> --tep <tệp.sql> | --cau \"<SQL>\" | --dem \"<SELECT>\"");
    process.exit(2);
  }
  const sql = kieu === "--tep" ? fs.readFileSync(giaTri, "utf8") : giaTri;
  const c = new Client({ connectionString: ketNoi });
  await c.connect();
  try {
    const kq = await c.query(sql);
    if (kieu === "--dem") console.log(String(kq.rowCount ?? 0));
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error("Lỗi SQL:", e.message);
  process.exit(1);
});
