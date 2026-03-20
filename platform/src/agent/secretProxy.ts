import * as http from 'http';
import * as net from 'net';

export interface SecretProxy {
  port: number;
  close(): Promise<void>;
}

export type SecretMap = Record<string, string>; // placeholder → realValue

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

function substituteSecrets(text: string, map: SecretMap): string {
  let result = text;
  for (const [placeholder, real] of Object.entries(map)) {
    result = result.replaceAll(placeholder, real);
  }
  return result;
}

export async function startSecretProxy(secrets: SecretMap): Promise<SecretProxy> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port) : 80,
      path: url.pathname + url.search,
      method: req.method,
      headers: { ...req.headers },
    };

    // Substitute placeholders in headers
    for (const [key, val] of Object.entries(options.headers!)) {
      if (typeof val === 'string') {
        (options.headers as Record<string, string>)[key] = substituteSecrets(val, secrets);
      }
    }
    // Remove proxy-specific headers
    delete (options.headers as any)['proxy-connection'];

    const chunks: Buffer[] = [];
    let bodySize = 0;

    req.on('data', (chunk: Buffer) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        req.destroy();
        if (!res.headersSent) res.writeHead(413);
        res.end('Request body too large');
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (res.writableEnded) return;
      const bodyText = Buffer.concat(chunks).toString('utf-8');
      const substitutedBody = substituteSecrets(bodyText, secrets);
      const bodyBuf = Buffer.from(substitutedBody, 'utf-8');

      // Update Content-Length (case-insensitive lookup)
      const clKey = Object.keys(options.headers!).find(k => k.toLowerCase() === 'content-length');
      if (clKey !== undefined) {
        (options.headers as Record<string, string>)[clKey] = String(bodyBuf.length);
      }

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode!, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error(`[secretProxy] upstream error: ${err.message}`);
        if (!res.headersSent) res.writeHead(502);
        res.end('Proxy error');
      });

      proxyReq.end(bodyBuf);
    });
  });

  // Handle CONNECT (HTTPS tunneling) — transparent relay, no TLS termination
  server.on('connect', (req, clientSocket, head) => {
    const [host, portStr] = (req.url ?? '').split(':');
    const port = parseInt(portStr || '443', 10);
    const serverSocket = net.connect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[secretProxy] CONNECT server socket error: ${err.message}`);
      clientSocket.destroy();
    });
    clientSocket.on('error', () => {
      serverSocket.destroy();
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        close: () => new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
    server.on('error', reject);
  });
}
