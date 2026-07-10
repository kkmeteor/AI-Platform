import requests
import re

DIFY_BASE = "http://10.10.9.65"
ADMIN_EMAIL = "tengfei.ma@sinounion.com"
ADMIN_PWD = "bWV0MTk4NzQyOX4="

# 1. 登录获取cookie会话
session = requests.Session()
login_resp = session.post(
    f"{DIFY_BASE}/console/api/login",
    json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}
)
login_resp.raise_for_status()

# 2. 分页拉取所有应用
all_web_apps = []
offset = 0
limit = 100
while True:
    res = session.get(
        f"{DIFY_BASE}/console/api/apps",
        params={"limit": limit, "offset": offset, "is_created_by_me": False}
    )
    data = res.json()
    app_list = data["data"]
    # 过滤已发布、开启Web访问的应用
    for app in app_list:
        if app["status"] == "published" and app["site"]["enable_site"]:
            all_web_apps.append({
                "app_id": app["id"],
                "name": app["name"],
                "web_url": app["site"]["app_base_url"],
                "app_api_key": app["site"]["access_token"],
                "mode": app["mode"]
            })
    if not data["has_more"]:
        break
    offset += limit

print("全部已发布Web应用：", all_web_apps)