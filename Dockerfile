FROM oven/bun:1.1 AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

COPY . .
RUN bun run build

# Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing + cache policy: index.html (and the SPA fallback serving it) must
# revalidate on every load so deploys take effect immediately (ETag/Last-Modified
# keep the revalidation a cheap 304), while Vite's content-hashed /assets bundles
# are cached forever.
RUN echo 'server { \
    listen 3000; \
    root /usr/share/nginx/html; \
    index index.html; \
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; } \
    location = /index.html { add_header Cache-Control "no-cache"; } \
    location / { add_header Cache-Control "no-cache"; try_files $uri $uri/ /index.html; } \
    location /api { proxy_pass http://go-service:8080; } \
    location /graphql { proxy_pass http://go-service:8080; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
