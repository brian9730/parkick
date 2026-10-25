import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

/** Read-only production preflight with generated unrelated art; no report or photo is saved. */
async function main(): Promise<void> {
  if (process.argv.length > 3) throw new Error('Unexpected arguments');
  const config = readConfig({ ...process.env, AI_PROVIDER: 'litellm' });
  if (config.ai.mode !== 'litellm' || !config.reports) throw new Error('LiteLLM report intake is not configured');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="white"/><circle cx="64" cy="70" r="30" fill="red"/><path d="M64 44Q67 30 75 25" stroke="brown" stroke-width="5" fill="none"/></svg>');
  const jpeg = await sharp(svg).jpeg().toBuffer();
  const app = await createApp(config);
  try {
    const response = await request(app).post('/api/reports/validate-photos')
      .set('Origin', config.frontendOrigin)
      .attach('photos', jpeg, { filename: 'generated-apple.jpg', contentType: 'image/jpeg' });
    if (response.status !== 422 || response.body?.error?.code !== 'PHOTO_NOT_PM') {
      throw new Error('Generated unrelated image was not rejected as expected');
    }
    if (process.argv[2]) {
      const positive = await readFile(resolve(process.argv[2]));
      const accepted = await request(app).post('/api/reports/validate-photos')
        .set('Origin', config.frontendOrigin)
        .attach('photos', positive, { filename: 'shared-scooters.jpg', contentType: 'image/jpeg' });
      if (accepted.status !== 200 || accepted.body?.data?.valid !== true) {
        const code = typeof accepted.body?.error?.code === 'string' ? accepted.body.error.code : 'UNKNOWN';
        throw new Error(`Shared scooter photo was not accepted: HTTP ${accepted.status}, code ${code}`);
      }
    }
    console.info(JSON.stringify({ status: 'ok', provider: 'litellm', unrelated: 'PHOTO_NOT_PM', sharedScooters: process.argv[2] ? 'accepted' : 'not_tested' }));
  } finally {
    await app.closeResources();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    if (error instanceof Error && error.message.startsWith('Shared scooter photo was not accepted: HTTP ')) {
      console.error(error.message);
    } else console.error('LiteLLM photo preflight failed. Check proxy reachability, model, and server settings.');
    process.exitCode = 1;
  });
}
