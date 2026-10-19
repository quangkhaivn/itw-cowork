# Thiết lập proxy dùng chung cho mọi location của nginx/cowork.conf.
# Đuôi .inc (không phải .conf) để nginx KHÔNG tự nạp tệp này ở cấp http — chỉ nạp qua `include`.

# Biến không kèm đường dẫn → nginx chuyển nguyên URI gốc của yêu cầu.
proxy_pass http://$cowork_app;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
# $remote_addr ở đây ĐÃ là IP thật của khách (module realip, xem cowork.conf). Ghi đè cả hai tiêu
# đề bằng giá trị đó: chuỗi X-Forwarded-For do khách tự gửi không lọt vào ứng dụng
# (src/lib/yeu-cau.ts tin X-Real-IP trước, rồi phần tử cuối của X-Forwarded-For).
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
# proxy_read_timeout đặt ở cấp server (cowork.conf) để location riêng ghi đè được.
