import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Isolated UI tests: neither Vite env files nor the production backend are loaded.
const server = await createServer({
  configFile: false, envDir: false, root: 'frontend', plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5179, strictPort: true },
});
await server.listen();
