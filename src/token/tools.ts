import md5 from 'md5';

export const sign = (
  requestPath: string,
  payload: Record<string, unknown> = {},
  timestamp: number,
  token: string,
) => {
  payload.timestamp = timestamp;
  payload.token = token;
  const sortedParams = String(Object.keys(payload).sort());
  return md5(md5(requestPath) + md5(sortedParams + md5(token) + timestamp));
};
