# ============================================
# DCloud Market - Backend Dockerfile
# FastAPI + SQLite (Python)
# ============================================
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 创建数据库目录和上传目录（uploads 优先使用宿主机 C:\Data\uploads 挂载，此处作为兜底）
RUN mkdir -p data uploads

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
