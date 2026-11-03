import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';
import { checkHealth, looksLikeHealthBody } from './health';

const HEALTH_BODY = JSON.stringify({
  status: 'ok',
  checks: { redis: true, memory: { used: 1, total: 2 } },
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe('health', () => {
  it('GET /health 返回本服务的响应体时判定为健康', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(HEALTH_BODY);
        return;
      }
      response.writeHead(404);
      response.end();
    });
    const port = await listen(server);
    try {
      expect(await checkHealth(port)).toBe(true);
    } finally {
      await close(server);
    }
  });

  it('服务未监听时判定为不健康', async () => {
    const server = createServer();
    const port = await listen(server);
    await close(server);
    expect(await checkHealth(port, 300)).toBe(false);
  });

  it('非 2xx 响应判定为不健康', async () => {
    const server = createServer((request, response) => {
      response.writeHead(500);
      response.end();
    });
    const port = await listen(server);
    try {
      expect(await checkHealth(port)).toBe(false);
    } finally {
      await close(server);
    }
  });

  it('端口被其他服务占用时不判定为健康', async () => {
    const server = createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html>another app</html>');
    });
    const port = await listen(server);
    try {
      expect(await checkHealth(port)).toBe(false);
    } finally {
      await close(server);
    }
  });

  it('looksLikeHealthBody 只接受带 status 与 checks 的 JSON', () => {
    expect(looksLikeHealthBody(HEALTH_BODY)).toBe(true);
    expect(looksLikeHealthBody('{"status":"ok"}')).toBe(false);
    expect(looksLikeHealthBody('{"checks":{}}')).toBe(false);
    expect(looksLikeHealthBody('not json')).toBe(false);
    expect(looksLikeHealthBody('null')).toBe(false);
  });
});
