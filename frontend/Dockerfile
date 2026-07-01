# ============================================
# DCloud Market - Frontend Dockerfile
# React + Vite (多阶段构建)
# ============================================

# ---- 第一阶段：构建 ----
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件并安装
COPY package.json package-lock.json ./
RUN npm ci

# 复制源代码并构建
COPY . .
RUN npm run build

# ---- 第二阶段：生产镜像 ----
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy static nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static files from build stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
