export interface ServerConfig {
  amapWebServiceKey: string;
  port: number;
}

export function getServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const amapWebServiceKey = env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!amapWebServiceKey) {
    throw new Error("AMAP_WEB_SERVICE_KEY is required");
  }

  const port = env.PORT === undefined ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return { amapWebServiceKey, port };
}
