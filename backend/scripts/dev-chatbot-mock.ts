import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { port: { type: 'string', default: '4020' }, 'frontend-port': { type: 'string', default: '5180' } } });
if (![values.port, values['frontend-port']].every(value => /^\d+$/.test(value) && Number(value) > 0 && Number(value) < 65536)) throw new Error('유효한 개발 서버 포트를 지정하세요.');

// 실제 .env와 프로세스의 키·AWS·DB 설정을 사용하지 않는 독립 개발 서버.
const config = readConfig({
  NODE_ENV: 'development', HOST: '127.0.0.1', PORT: values.port,
  FRONTEND_ORIGIN: `http://127.0.0.1:${values['frontend-port']}`,
  CHATBOT_PROVIDER: 'mock', AI_PROVIDER: 'disabled',
  CHATBOT_API_KEY: '', CHATBOT_BASE_URL: '', DATABASE_URL: '', ENABLE_DEV_ADMIN: 'false',
});
const app = await createApp(config, {
  chatFetch: async () => { throw new Error('Mock 개발 서버에서는 외부 LLM 호출이 금지됩니다.'); },
});
const server = app.listen(config.port, config.host, () => {
  console.info(`챗봇 Mock 백엔드: http://127.0.0.1:${config.port} (.env 미사용, 외부 LLM·AWS·DB 미사용)`);
});
server.on('error', () => {
  console.error('Mock 백엔드를 시작하지 못했습니다. 4020번 포트 사용 여부를 확인하세요.');
  process.exitCode = 1;
});
const shutdown = () => {
  server.close(() => { void app.closeResources().then(() => process.exit(0), () => process.exit(1)); });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
