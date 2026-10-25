import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

export function configureNginx(template, apiBaseUrl, options = {}) {
  let apiUrl;
  try {
    apiUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute HTTP(S) URL');
  }

  if (
    !['http:', 'https:'].includes(apiUrl.protocol) ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash
  ) {
    throw new Error('VITE_API_BASE_URL must be a plain HTTP(S) API URL');
  }
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(
    apiUrl.hostname,
  );
  if (isLocalHost && !options.allowLocal) {
    throw new Error(
      'Local API URLs are allowed only in an explicitly local dashboard build',
    );
  }

  if (!template.includes('__API_CONNECT_ORIGIN__')) {
    throw new Error('Nginx config is missing the API origin placeholder');
  }

  return template.replaceAll('__API_CONNECT_ORIGIN__', apiUrl.origin);
}

async function writeConfiguredNginx() {
  const frontendDirectory = fileURLToPath(new URL('.', import.meta.url));
  const templatePath = `${frontendDirectory}nginx.conf`;
  const outputPath = `${frontendDirectory}nginx.conf.generated`;
  const apiBaseUrl = process.env.VITE_API_BASE_URL;
  const allowLocal = process.env.LEETSYNC_ALLOW_LOCAL_API_URL === 'true';
  if (!apiBaseUrl) {
    throw new Error(
      'VITE_API_BASE_URL is required to build the dashboard image',
    );
  }
  const template = await readFile(templatePath, 'utf8');
  await writeFile(
    outputPath,
    configureNginx(template, apiBaseUrl, { allowLocal }),
    'utf8',
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await writeConfiguredNginx();
}
