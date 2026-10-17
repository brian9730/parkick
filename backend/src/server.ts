import 'dotenv/config';
import { createApp } from './app.js';
import { readConfig } from './config.js';

async function main(): Promise<void> {
  const config = readConfig();
  const app = await createApp(config);
  const server = app.listen(config.port, config.host, () => {
    console.info(JSON.stringify({ event: 'server_started', host: config.host, port: config.port, phase: 5, adminAuth: config.environment !== 'production' && config.devAdmin ? 'development-mock' : config.reports?.databaseUrl ? 'database' : 'disabled', aiMode: config.ai.mode, reports: config.reports ? config.reports.storage?.mode ?? 'local' : 'disabled' }));
  });
  server.on('error', () => {
    console.error('Parkick API 포트를 열지 못했습니다. HOST와 PORT 설정 및 포트 사용 여부를 확인하세요.');
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => { void app.closeResources().then(() => process.exit(0), () => process.exit(1)); });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(() => {
  // Configuration values, error causes and stacks can contain credentials.
  console.error('Parkick API를 시작하지 못했습니다. 환경변수 형식, 개발 관리자 및 AI 설정을 확인하세요.');
  process.exitCode = 1;
});
