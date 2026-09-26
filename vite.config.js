import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Serves api/*.js at /api/* during `npm run dev`, so the same files work
// locally and as Vercel functions (export async function GET/POST(request)).
function apiRoutes() {
  return {
    name: 'api-routes',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();

        try {
          const name = url.pathname.slice('/api/'.length);
          const mod = await server.ssrLoadModule(`/api/${name}.js`);
          const handler = mod[req.method];
          if (!handler) {
            res.statusCode = 405;
            return res.end('Method not allowed');
          }

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
          const request = new Request(url, { method: req.method, headers: req.headers, body });

          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error(err);
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose .env (including non-VITE_ keys) to api/ handlers via process.env.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return { plugins: [react(), apiRoutes()] };
});
