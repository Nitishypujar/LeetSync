import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_ROOT_CA_PATH = fileURLToPath(
  new URL('../certs/supabase-prod-ca-2021.crt', import.meta.url),
);

const SSL_QUERY_PARAMETERS = [
  'ssl',
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslpassword',
  'sslidentity',
  'sslnegotiation',
  'uselibpqcompat',
  'sslaccept',
];

type DatabasePoolConfig = {
  connectionString: string;
  ssl?: {
    ca: string;
    rejectUnauthorized: true;
  };
};

function isSupabaseDatabaseHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname.endsWith('.pooler.supabase.com') ||
    normalizedHostname.endsWith('.supabase.co')
  );
}

export function getDatabasePoolConfig(
  connectionString: string,
  configuredCaPath = process.env.DATABASE_SSL_ROOT_CERT?.trim(),
): DatabasePoolConfig {
  const url = new URL(connectionString);
  const caPath = configuredCaPath || undefined;
  const useSupabaseCa = isSupabaseDatabaseHost(url.hostname);

  if (!caPath && !useSupabaseCa) {
    return { connectionString };
  }

  const ca = readFileSync(
    caPath ? resolve(caPath) : SUPABASE_ROOT_CA_PATH,
    'utf8',
  );

  // node-postgres replaces the ssl object when SSL query parameters are in
  // the connection string, so keep the CA and strict verification in config.
  for (const parameter of SSL_QUERY_PARAMETERS) {
    url.searchParams.delete(parameter);
  }

  return {
    connectionString: url.toString(),
    ssl: {
      ca,
      rejectUnauthorized: true,
    },
  };
}
