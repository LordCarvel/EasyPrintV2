const http = require('node:http');
const { spawn } = require('node:child_process');
const electronPath = require('electron');

const devUrl = 'http://127.0.0.1:5173';

function isDevServerReady() {
  return new Promise((resolve) => {
    const request = http.get(devUrl, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(600, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForDevServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await isDevServerReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Vite nao ficou pronto em http://127.0.0.1:5173');
}

async function main() {
  let viteProcess = null;
  const electronEnv = {
    ...process.env,
    ELECTRON_START_URL: devUrl,
  };

  delete electronEnv.ELECTRON_RUN_AS_NODE;

  if (!(await isDevServerReady())) {
    viteProcess = spawn(
      process.execPath,
      ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          ELECTRON_RUN: '1',
        },
      },
    );

    await waitForDevServer();
  }

  const electronProcess = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: electronEnv,
  });

  electronProcess.on('exit', (code) => {
    if (viteProcess) {
      viteProcess.kill();
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
