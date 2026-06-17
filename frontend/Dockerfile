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

# 删除默认配置
RUN rm /etc/nginx/conf.d/default.conf

# 复制自定义 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段复制静态文件
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
