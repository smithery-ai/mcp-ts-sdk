"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const node_crypto_1 = require("node:crypto");
const mcp_js_1 = require("../../server/mcp.js");
const streamableHttp_js_1 = require("../../server/streamableHttp.js");
const zod_1 = require("zod");
// Create an MCP server with implementation details
const server = new mcp_js_1.McpServer({
    name: 'json-response-streamable-http-server',
    version: '1.0.0',
}, {
    capabilities: {
        logging: {},
    }
});
// Register a simple tool that returns a greeting
server.tool('greet', 'A simple greeting tool', {
    name: zod_1.z.string().describe('Name to greet'),
}, async ({ name }) => {
    return {
        content: [
            {
                type: 'text',
                text: `Hello, ${name}!`,
            },
        ],
    };
});
// Register a tool that sends multiple greetings with notifications
server.tool('multi-greet', 'A tool that sends different greetings with delays between them', {
    name: zod_1.z.string().describe('Name to greet'),
}, async ({ name }, { sendNotification }) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    await sendNotification({
        method: "notifications/message",
        params: { level: "debug", data: `Starting multi-greet for ${name}` }
    });
    await sleep(1000); // Wait 1 second before first greeting
    await sendNotification({
        method: "notifications/message",
        params: { level: "info", data: `Sending first greeting to ${name}` }
    });
    await sleep(1000); // Wait another second before second greeting
    await sendNotification({
        method: "notifications/message",
        params: { level: "info", data: `Sending second greeting to ${name}` }
    });
    return {
        content: [
            {
                type: 'text',
                text: `Good morning, ${name}!`,
            }
        ],
    };
});
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Map to store transports by session ID
const transports = {};
app.post('/mcp', async (req, res) => {
    console.log('Received MCP request:', req.body);
    try {
        // Check for existing session ID
        const sessionId = req.headers['mcp-session-id'];
        let transport;
        if (sessionId && transports[sessionId]) {
            // Reuse existing transport
            transport = transports[sessionId];
        }
        else if (!sessionId && isInitializeRequest(req.body)) {
            // New initialization request - use JSON response mode
            transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
                sessionIdGenerator: () => (0, node_crypto_1.randomUUID)(),
                enableJsonResponse: true, // Enable JSON response mode
            });
            // Connect the transport to the MCP server BEFORE handling the request
            await server.connect(transport);
            // After handling the request, if we get a session ID back, store the transport
            await transport.handleRequest(req, res, req.body);
            // Store the transport by session ID for future requests
            if (transport.sessionId) {
                transports[transport.sessionId] = transport;
            }
            return; // Already handled
        }
        else {
            // Invalid request - no session ID or not initialization request
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided',
                },
                id: null,
            });
            return;
        }
        // Handle the request with existing transport - no need to reconnect
        await transport.handleRequest(req, res, req.body);
    }
    catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});
// Handle GET requests for SSE streams according to spec
app.get('/mcp', async (req, res) => {
    // Since this is a very simple example, we don't support GET requests for this server
    // The spec requires returning 405 Method Not Allowed in this case
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
});
// Helper function to detect initialize requests
function isInitializeRequest(body) {
    if (Array.isArray(body)) {
        return body.some(msg => typeof msg === 'object' && msg !== null && 'method' in msg && msg.method === 'initialize');
    }
    return typeof body === 'object' && body !== null && 'method' in body && body.method === 'initialize';
}
// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
    console.log(`Initialize session with the command below id you are using curl for testing: 
  -----------------------------
  SESSION_ID=$(curl -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "capabilities": {},
      "protocolVersion": "2025-03-26", 
      "clientInfo": {
        "name": "test",
        "version": "1.0.0"
      }
    },
    "id": "1"
  }' \
  -i http://localhost:3000/mcp 2>&1 | grep -i "mcp-session-id" | cut -d' ' -f2 | tr -d '\\r')
  echo "Session ID: $SESSION_ID"
  -----------------------------`);
});
// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await server.close();
    process.exit(0);
});
//# sourceMappingURL=jsonResponseStreamableHttp.js.map