export function requestOptions(mode: string) {
  const timeoutMs = 5000;
  const region = 'us-east-1';
  const token = process.env.SERVICE_API_TOKEN;
  return {
    path: '/var/cache/groundwork',
    url: 'https://example.test/api',
    configKey: 'network.retry.limit',
    headers: { token, mode },
    timeoutMs,
    region,
  };
}
