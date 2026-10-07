import http from 'node:http';
import net from 'node:net';

// A minimal in-memory SMTP inbox for the journeys that need an emailed code
// (registration OTP, forgot password). The auth service is pointed at it
// with SMTP_HOST=localhost SMTP_PORT=1025 SMTP_SECURE=false, and specs read
// the captured mail over HTTP (see mail.ts). Started once per run by
// global-setup.ts; no Docker or extra package needed.
//
// SMTP: plain, no TLS and no auth - it only ever listens on localhost.
// HTTP: GET /messages?to=<address>  -> captured messages for that recipient
//       DELETE /messages            -> clears the inbox

export interface CapturedMail {
  to: string[];
  raw: string;
  receivedAt: number;
}

export function startMailSink(smtpPort: number, httpPort: number): Promise<() => Promise<void>> {
  const inbox: CapturedMail[] = [];

  const smtp = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let inData = false;
    let recipients: string[] = [];
    const reply = (line: string) => socket.write(`${line}\r\n`);

    reply('220 e2e-mail-sink ESMTP ready');

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) {
            return;
          }
          // Undo SMTP dot-stuffing.
          const raw = buffer.slice(0, end).replace(/\r\n\.\./g, '\r\n.');
          buffer = buffer.slice(end + 5);
          inbox.push({ to: recipients, raw, receivedAt: Date.now() });
          recipients = [];
          inData = false;
          reply('250 OK: queued');
          continue;
        }

        const eol = buffer.indexOf('\r\n');
        if (eol === -1) {
          return;
        }
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        const command = line.slice(0, 4).toUpperCase();

        if (command === 'EHLO') {
          reply('250-e2e-mail-sink');
          reply('250 8BITMIME');
        } else if (command === 'HELO') {
          reply('250 e2e-mail-sink');
        } else if (command === 'MAIL') {
          recipients = [];
          reply('250 OK');
        } else if (command === 'RCPT') {
          const match = /<([^>]+)>/.exec(line);
          if (match) {
            recipients.push(match[1].toLowerCase());
          }
          reply('250 OK');
        } else if (command === 'DATA') {
          inData = true;
          reply('354 End data with <CR><LF>.<CR><LF>');
        } else if (command === 'QUIT') {
          reply('221 Bye');
          socket.end();
          return;
        } else {
          // RSET, NOOP and anything else: accept.
          reply('250 OK');
        }
      }
    });
    socket.on('error', () => undefined);
  });

  const api = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${httpPort}`);
    if (url.pathname !== '/messages') {
      res.writeHead(404).end();
      return;
    }
    if (req.method === 'DELETE') {
      inbox.length = 0;
      res.writeHead(204).end();
      return;
    }
    const to = url.searchParams.get('to')?.toLowerCase();
    const messages = to ? inbox.filter((mail) => mail.to.includes(to)) : inbox;
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(messages));
  });

  const listen = (server: net.Server, port: number) =>
    new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    });
  const close = (server: net.Server) => new Promise<void>((resolve) => server.close(() => resolve()));

  return Promise.all([listen(smtp, smtpPort), listen(api, httpPort)]).then(() => async () => {
    await Promise.all([close(smtp), close(api)]);
  });
}
