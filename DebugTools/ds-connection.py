
import requests

headers = {
    "Authorization": "Bearer sk-5e2e39f3f6f146df9e705ab38310fd0b",
    "Content-Type": "application/json"
}
payload = {
    "model": "deepseek-v4-flash",
    "messages": [{"role": "user", "content": "测试"}]
}

res = requests.post("https://api.deepseek.com/v1/chat/completions", headers=headers, json=payload)
print(res.status_code)
print(res.text)