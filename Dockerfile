# Ảnh dùng chung cho cả `app` và `worker` — cùng mã nguồn, khác lệnh chạy.
# Cố tình không dùng bản dựng standalone: worker cần tsx và Prisma CLI,
# mà standalone thì cắt mất devDependencies. Ảnh to hơn nhưng ít chỗ hỏng hơn.

FROM node:22-alpine

WORKDIR /app

# Prisma cần openssl; postgresql-client để chờ database và chạy lệnh vá.
RUN apk add --no-cache openssl postgresql-client

# Mạng từ Việt Nam ra registry npm hay đứt giữa chừng. Nới thời gian chờ và
# tăng số lần thử lại, nếu không bản dựng sẽ hỏng vì ECONNRESET.
RUN npm config set fetch-retries 8 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 180000 \
 && npm config set fetch-timeout 900000 \
 && npm config set maxsockets 5

COPY package.json package-lock.json* ./

# Thử lại tối đa 3 vòng: mỗi vòng npm tự thử lại 8 lần, nhưng nếu vẫn đứt thì
# chạy lại toàn bộ lệnh vẫn rẻ hơn hỏng cả bản dựng.
RUN for lan in 1 2 3; do \
      echo "--- npm install, vong $lan ---"; \
      npm install --no-audit --no-fund && break; \
      echo "vong $lan hong, nghi 15s roi thu lai"; sleep 15; \
    done; \
    test -d node_modules/next || (echo "npm install that bai sau 3 vong" && exit 1)

COPY . .

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
