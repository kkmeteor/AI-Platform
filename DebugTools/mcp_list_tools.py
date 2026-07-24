import json
import urllib.request
import urllib.error

SESSION_ID = None
MCP_URL = "http://10.10.11.194:9887/mcp"


def post(method, params=None):
    global SESSION_ID
    payload = {"jsonrpc": "2.0", "id": 1, "method": method}
    if params:
        payload["params"] = params

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Content-Length": str(len(body)),
    }
    if SESSION_ID:
        headers["Mcp-Session-Id"] = SESSION_ID

    req = urllib.request.Request(MCP_URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            sid = resp.headers.get("Mcp-Session-Id")
            if sid:
                SESSION_ID = sid

            data = resp.read().decode("utf-8")
            # Try to extract SSE data line
            for line in data.splitlines():
                if line.startswith("data:"):
                    return json.loads(line[len("data:"):].strip())
            return data
    except urllib.error.URLError as e:
        raise RuntimeError(f"Request failed: {e}") from e


def main():
    # Step 1: Initialize
    init_result = post("initialize", {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "1.0"},
    })
    print("=== Server Info ===")
    print(json.dumps(init_result, indent=2, ensure_ascii=False))

    # Step 2: Send initialized notification
    post("notifications/initialized")

    # Step 3: List tools
    tools_result = post("tools/list")
    print("\n=== Tools ===")
    if isinstance(tools_result, dict) and "result" in tools_result and "tools" in tools_result["result"]:
        tools = tools_result["result"]["tools"]
        for tool in tools:
            print(f"\n--- {tool['name']} ---")
            print(f"Description: {tool.get('description', '(none)')}")
            if "inputSchema" in tool:
                print(f"Input Schema: {json.dumps(tool['inputSchema'], indent=2, ensure_ascii=False)}")
        print(f"\nTotal: {len(tools)} tools")
    else:
        print(json.dumps(tools_result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}")
