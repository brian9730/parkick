import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const { values } = parseArgs({ options: { port: { type: 'string', default: '5180' }, 'api-port': { type: 'string', default: '4020' } } });
if (![values.port, values['api-port']].every(value => /^\d+$/.test(value) && Number(value) > 0 && Number(value) < 65536)) throw new Error('유효한 개발 서버 포트를 지정하세요.');

// 기존 Vite 설정의 loadEnv도 호출하지 않는다. 현재 CSS·UI 소스를 그대로 제공한다.
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, envDir: false,
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1', port: Number(values.port), strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${values['api-port']}`, changeOrigin: true } },
  },
});
await server.listen();
console.info(`챗봇 Mock 화면: http://127.0.0.1:${values.port} (.env 미사용, 실제 로컬 백엔드 연결)`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { void server.close().then(() => process.exit(0)); });
}
