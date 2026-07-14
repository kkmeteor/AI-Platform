const http = require('http');

let sessionId = null;

function post(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {})
    });
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(body)
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const req = http.request('http://10.10.11.194:9887/mcp', { method: 'POST', headers }, res => {
      // Capture session ID from response headers
      const sid = res.headers['mcp-session-id'];
      if (sid) sessionId = sid;

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const m = data.match(/data:\s*(.+)/);
        if (m) resolve(JSON.parse(m[1]));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  // Step 1: Initialize
  const initResult = await post('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0' }
  });
  console.log('=== Server Info ===');
  console.log(JSON.stringify(initResult, null, 2));

  // Step 2: Send initialized notification
  await post('notifications/initialized');

  // Step 3: List tools
  const toolsResult = await post('tools/list');
  console.log('\n=== Tools ===');
  if (toolsResult.result && toolsResult.result.tools) {
    toolsResult.result.tools.forEach(tool => {
      console.log(`\n--- ${tool.name} ---`);
      console.log(`Description: ${tool.description || '(none)'}`);
      if (tool.inputSchema) {
        console.log(`Input Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`);
      }
    });
    console.log(`\nTotal: ${toolsResult.result.tools.length} tools`);
  } else {
    console.log(JSON.stringify(toolsResult, null, 2));
  }
}

run().catch(e => console.error(e));
