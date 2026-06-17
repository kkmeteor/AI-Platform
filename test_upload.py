"""测试 JSON + base64 文件上传"""
import base64
import requests

# 构造 base64 文件数据
fake_zip = b"PK\x03\x04fake zip content"
file_base64 = base64.b64encode(fake_zip).decode()

payload = {
    "name": "测试Skill",
    "description": "测试描述",
    "author": "测试者",
    "version": "1.0.0",
    "tags": "test,debug",
    "file_base64": file_base64,
    "file_name": "test.zip",
}

# 测试 1: 直接发送到后端
print("=== 测试 1: 直接 POST 到后端 (JSON + base64) ===")
try:
    resp = requests.post("http://localhost:8000/api/skills", json=payload)
    print(f"状态码: {resp.status_code}")
    print(f"响应: {resp.text}")
except Exception as e:
    print(f"请求失败: {e}")

print()

# 测试 2: 通过 Vite 代理发送
print("=== 测试 2: 通过 Vite 代理 (JSON + base64) ===")
try:
    resp2 = requests.post("http://localhost:5173/api/skills", json=payload)
    print(f"状态码: {resp2.status_code}")
    print(f"响应: {resp2.text}")
except Exception as e:
    print(f"请求失败: {e}")
