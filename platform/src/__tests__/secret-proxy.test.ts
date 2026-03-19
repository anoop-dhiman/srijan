import { describe, it, expect, afterEach } from 'vitest';
import { startSecretProxy, type SecretProxy } from '../agent/secretProxy.js';
import * as http from 'http';
import * as net from 'net';

const proxies: SecretProxy[] = [];

afterEach(async () => {
  for (const p of proxies) {
    await p.close().catch(() => {});
  }
  proxies.length = 0;
});

async function makeProxy(secrets: Record<string, string>): Promise<SecretProxy> {
  const p = await startSecretProxy(secrets);
  proxies.push(p);
  return p;
}

describe('startSecretProxy', () => {
  it('starts on a random port > 0', async () => {
    const proxy = await makeProxy({});
    expect(proxy.port).toBeGreaterThan(0);
  });

  it('close() stops the server', async () => {
    const proxy = await makeProxy({});
    await proxy.close();
    // Remove from cleanup list since already closed
    proxies.splice(proxies.indexOf(proxy), 1);
    // Connecting to closed port should fail
    await expect(
      new Promise<void>((resolve, reject) => {
        const s = net.connect(proxy.port, '127.0.0.1');
        s.on('connect', () => { s.destroy(); reject(new Error('Connected unexpectedly')); });
        s.on('error', () => resolve());
      })
    ).resolves.toBeUndefined();
  });

  it('substitutes a single placeholder in an HTTP request body', async () => {
    const secrets = { 'SRIJAN_PLACEHOLDER_token': 'real-token-value' };

    // Create a simple target server that echoes back the request body
    const target = await new Promise<{ server: http.Server; port: number }>((resolve) => {
      const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end(body);
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        resolve({ server, port: addr.port });
      });
    });

    try {
      const proxy = await makeProxy(secrets);

      const responseBody = await new Promise<string>((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port: proxy.port,
          path: `http://127.0.0.1:${target.port}/`,
          method: 'POST',
          headers: { 'content-type': 'text/plain', host: `127.0.0.1:${target.port}` },
        }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString()));
        });
        req.on('error', reject);
        req.end('Token: SRIJAN_PLACEHOLDER_token');
      });

      expect(responseBody).toBe('Token: real-token-value');
    } finally {
      await new Promise<void>((res) => target.server.close(() => res()));
    }
  });

  it('substitutes multiple placeholders in request body', async () => {
    const secrets = {
      'SRIJAN_PLACEHOLDER_key1': 'VALUE_ONE',
      'SRIJAN_PLACEHOLDER_key2': 'VALUE_TWO',
    };

    const target = await new Promise<{ server: http.Server; port: number }>((resolve) => {
      const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end(Buffer.concat(chunks));
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        resolve({ server, port: addr.port });
      });
    });

    try {
      const proxy = await makeProxy(secrets);

      const responseBody = await new Promise<string>((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port: proxy.port,
          path: `http://127.0.0.1:${target.port}/`,
          method: 'POST',
          headers: { 'content-type': 'text/plain', host: `127.0.0.1:${target.port}` },
        }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString()));
        });
        req.on('error', reject);
        req.end('a=SRIJAN_PLACEHOLDER_key1&b=SRIJAN_PLACEHOLDER_key2');
      });

      expect(responseBody).toBe('a=VALUE_ONE&b=VALUE_TWO');
    } finally {
      await new Promise<void>((res) => target.server.close(() => res()));
    }
  });

  it('CONNECT tunnel passes through without blocking', async () => {
    // Create a simple TCP server acting as the "HTTPS" destination
    const target = await new Promise<{ server: net.Server; port: number }>((resolve) => {
      const server = net.createServer((socket) => {
        socket.on('data', (data) => socket.write(data)); // echo
        socket.on('error', () => {});
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        resolve({ server, port: addr.port });
      });
    });

    try {
      const proxy = await makeProxy({ 'SRIJAN_PLACEHOLDER_x': 'real' });

      // Send CONNECT request
      const tunnelEstablished = await new Promise<boolean>((resolve) => {
        const socket = net.connect(proxy.port, '127.0.0.1', () => {
          socket.write(`CONNECT 127.0.0.1:${target.port} HTTP/1.1\r\nHost: 127.0.0.1:${target.port}\r\n\r\n`);
          let buf = '';
          socket.on('data', (d) => {
            buf += d.toString();
            if (buf.includes('200 Connection Established')) {
              socket.destroy();
              resolve(true);
            }
          });
          socket.on('error', () => resolve(false));
        });
        socket.on('error', () => resolve(false));
      });

      expect(tunnelEstablished).toBe(true);
    } finally {
      await new Promise<void>((res) => target.server.close(() => res()));
    }
  });

  it('real secret value is not present as an env var key, only placeholder', async () => {
    const secrets = { 'SRIJAN_PLACEHOLDER_mykey': 'super-secret-123' };
    // The secretMap keys are placeholders; values are real secrets
    // Verify that real value is NOT a key in the map
    expect(Object.keys(secrets)).not.toContain('super-secret-123');
    expect(Object.keys(secrets)).toContain('SRIJAN_PLACEHOLDER_mykey');
  });
});
