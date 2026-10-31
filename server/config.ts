export interface ServerConfig {
  amapWebServiceKey: string;
  amapMaxQps: number;
  port: number;
}

export function getServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const amapWebServiceKey = env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!amapWebServiceKey) {
    throw new Error("AMAP_WEB_SERVICE_KEY is required");
  }

  const amapMaxQps =
    env.AMAP_MAX_QPS === undefined ? 3 : Number(env.AMAP_MAX_QPS);
  if (!Number.isInteger(amapMaxQps) || amapMaxQps < 1 || amapMaxQps > 3) {
    throw new Error("AMAP_MAX_QPS must be an integer between 1 and 3");
  }

  const port = env.PORT === undefined ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return { amapWebServiceKey, amapMaxQps, port };
}
