import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';
import { checkHealth, waitForHealthy } from './health';

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
  it('GET /health 返回 2xx 时判定为健康', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{"status":"ok"}');
        return;
      }
      response.writeHead(404);
      response.end();
    });
    const port = await listen(server);
    try {
      expect(await checkHealth(port)).toBe(true);
      expect(await waitForHealthy(port, 2000)).toBe(true);
    } finally {
      await close(server);
    }
  });

  it('服务未监听时判定为不健康', async () => {
    const server = createServer();
    const port = await listen(server);
    await close(server);
    expect(await checkHealth(port, 300)).toBe(false);
    expect(await waitForHealthy(port, 300)).toBe(false);
  });

  it('非 2xx/3xx 响应判定为不健康', async () => {
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
});
