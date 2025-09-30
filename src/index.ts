// src/index.ts
import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parseUrlParams, validationSchema, validateSchema } from './lib.js';
import { v4 as uuid } from 'uuid';
import { SessionInstance } from './services/instance.js';
import { confirmAccountAccess, validateToken } from './services/auth.js';

const port = process.env.PORT || 8080;

// In-memory store for sessions per account ID
// Consider making this `accountID+sessionID` if you want to support multiple sessions per account
// LRU cache could be a good idea here too
const sessions = new Map<string, SessionInstance>();

// 1. Create a native Node.js HTTP server with types
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Audio Streamer is running. Connect via WebSocket.');
  } else {
    res.writeHead(404);
    res.end();
  }
});

// 3. Create a WebSocket server
const wss = new WebSocketServer({ noServer: true });
console.log('WebSocket server started. Listening for connections...');

// 4. Handle the HTTP upgrade to WebSocket and authenticate the request
server.on('upgrade', async function upgrade(request, socket, head) {
  // console.log('Upgrade request received', request.url);

  const [_path, query] = (request.url || '').split('?');

  const searchParams = new URLSearchParams(query);
  const params = parseUrlParams(searchParams);

  const hasError = await validateSchema(validationSchema, params)
    .then(() => false)
    .catch((e) => {
      console.log('Validation Error', e);
      return true;
    });

  // Handle validation errors
  if (hasError) {
    console.log('Block invalid', params.accountId);
    socket.write('HTTP/1.1 422 Unprocessable Content\r\n\r\n');
    socket.destroy();
    return;
  }

  const token = await validateToken(
    process.env.SUPABASE_JWT_SECRET!,
    searchParams.get('token') || ''
  );

  if (!token) {
    console.log('Block unauthorized', params.accountId);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const confirmation = await confirmAccountAccess(
    token,
    params.accountId
  ).catch((e) => {
    console.log('Block forbidden user', params.accountId);
    socket.write(`HTTP/1.1 ${e} Forbidden\r\n\r\n`);
    socket.destroy();

    return undefined;
  });

  // User doesn't have access to account
  if (!confirmation) {
    return;
  }

  const currentSession = sessions.get(params.accountId);

  if (currentSession) {
    const hasClient = !!currentSession.clientWs;

    if (hasClient) {
      console.log('Block concurrent', params.accountId);
      socket.write('HTTP/1.1 409 Conflict\r\n\r\n');
      socket.destroy();
      return;
    }

    console.log(
      `${currentSession.accountId}|${currentSession.sessionId}`,
      'Reconnecting existing session'
    );

    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit('connection', ws, request, currentSession);
    });
    return;
  }

  const sessionId = uuid();

  console.log(
    `${params.accountId}|${sessionId}`,
    'New WebSocket connection established'
  );

  function onCleanup() {
    sessions.delete(params.accountId);
  }

  const session = new SessionInstance(
    params.accountId,
    sessionId,
    params,
    onCleanup
  );

  await session.init().catch((e) => {
    session.terminate();
    console.log('Error initializing session:', e);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
    return;
  });

  wss.handleUpgrade(request, socket, head, function done(ws) {
    wss.emit('connection', ws, request, session);
  });
});

// 5. Handle new WebSocket connections with explicit types
wss.on(
  'connection',
  async (ws: WebSocket, request: IncomingMessage, session: SessionInstance) => {
    session.connectClient(ws);
    sessions.set(session.accountId, session);
  }
);

server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
