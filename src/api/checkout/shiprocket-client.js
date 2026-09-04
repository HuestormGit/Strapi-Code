'use strict';

const axios = require('axios');

const TIMEOUT_MS = 10_000;
const TOKEN_EXPIRY_SAFETY_MS = 5 * 60 * 1000;
const FALLBACK_TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;
const MAX_API_OPERATION_ATTEMPTS = 2;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

let cachedToken = null;
let tokenExpiresAt = 0;
let loginPromise = null;

class ShiprocketError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ShiprocketError';
    this.code = code;
    this.status = 503;
  }
}

const readConfig = (env = process.env) => {
  const value = (name) =>
    typeof env[name] === 'string' ? env[name].trim() : '';
  const email = value('SHIPROCKET_API_EMAIL');
  const password = value('SHIPROCKET_API_PASSWORD');
  const baseURL = value('SHIPROCKET_API_BASE_URL');

  if (!email || !password || !baseURL) {
    throw new ShiprocketError(
      'SHIPROCKET_CONFIG_ERROR',
      'Shiprocket configuration is incomplete'
    );
  }

  try {
    const url = new URL(baseURL);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    throw new ShiprocketError(
      'SHIPROCKET_CONFIG_ERROR',
      'Shiprocket base URL is invalid'
    );
  }

  return { email, password, baseURL: baseURL.replace(/\/+$/, '') };
};

const login = async ({ env = process.env, httpClient = axios } = {}) => {
  const { email, password, baseURL } = readConfig(env);

  let response;
  try {
    response = await httpClient.post(
      `${baseURL}/auth/login`,
      { email, password },
      { timeout: TIMEOUT_MS }
    );
  } catch (error) {
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      throw new ShiprocketError(
        'SHIPROCKET_TIMEOUT',
        'Shiprocket request timed out'
      );
    }
    if (error?.response?.status >= 400 && error.response.status < 500) {
      throw new ShiprocketError(
        'SHIPROCKET_AUTH_ERROR',
        'Shiprocket authentication failed'
      );
    }
    if (error?.response?.status >= 500) {
      throw new ShiprocketError(
        'SHIPROCKET_PROVIDER_ERROR',
        'Shiprocket service is unavailable'
      );
    }
    throw new ShiprocketError(
      'SHIPROCKET_NETWORK_ERROR',
      'Shiprocket network request failed'
    );
  }

  const token = response?.data?.token;
  if (typeof token !== 'string' || !token.trim()) {
    throw new ShiprocketError(
      'SHIPROCKET_AUTH_ERROR',
      'Shiprocket returned an invalid authentication response'
    );
  }

  return { token: token.trim() };
};

const expiryFor = (token, now) => {
  const fallback = now + FALLBACK_TOKEN_TTL_MS;

  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return fallback;

    // Decoded only for cache metadata; this does not verify the JWT.
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const expiresAt = payload.exp * 1000;
    if (
      typeof payload.exp !== 'number' ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now
    ) {
      return fallback;
    }
    return expiresAt - TOKEN_EXPIRY_SAFETY_MS;
  } catch {
    return fallback;
  }
};

const getAuthToken = async ({ env = process.env, httpClient = axios, now = Date.now } = {}) => {
  if (
    typeof cachedToken === 'string' &&
    cachedToken.trim() &&
    now() < tokenExpiresAt
  ) {
    return cachedToken;
  }

  if (!loginPromise) {
    loginPromise = login({ env, httpClient })
      .then(({ token }) => {
        cachedToken = token;
        tokenExpiresAt = expiryFor(token, now());
        return token;
      })
      .finally(() => {
        loginPromise = null;
      });
  }

  return loginPromise;
};

const invalidateAuthToken = (staleToken) => {
  if (staleToken !== undefined && cachedToken !== staleToken) return false;
  cachedToken = null;
  tokenExpiresAt = 0;
  return true;
};

const requestError = (error) => {
  if (error instanceof ShiprocketError) return error;
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return new ShiprocketError(
      'SHIPROCKET_TIMEOUT',
      'Shiprocket request timed out'
    );
  }
  if (error?.response?.status === 401) {
    return new ShiprocketError(
      'SHIPROCKET_AUTH_ERROR',
      'Shiprocket authentication failed'
    );
  }
  if (error?.response?.status >= 400 && error.response.status < 500) {
    return new ShiprocketError(
      'SHIPROCKET_REQUEST_ERROR',
      'Shiprocket request was rejected'
    );
  }
  if (error?.response?.status >= 500) {
    return new ShiprocketError(
      'SHIPROCKET_PROVIDER_ERROR',
      'Shiprocket service is unavailable'
    );
  }
  return new ShiprocketError(
    'SHIPROCKET_NETWORK_ERROR',
    'Shiprocket network request failed'
  );
};

const shiprocketRequest = async (
  { method, path, params, data, headers } = {},
  { env = process.env, httpClient = axios, now = Date.now } = {}
) => {
  const normalizedMethod =
    typeof method === 'string' ? method.trim().toUpperCase() : '';
  if (!ALLOWED_METHODS.has(normalizedMethod)) {
    throw new ShiprocketError(
      'SHIPROCKET_REQUEST_ERROR',
      'Shiprocket request method is invalid'
    );
  }

  const relativePath = typeof path === 'string' ? path.trim() : '';
  if (!relativePath.startsWith('/') || relativePath.startsWith('//')) {
    throw new ShiprocketError(
      'SHIPROCKET_REQUEST_ERROR',
      'Shiprocket request path must be relative'
    );
  }

  if (
    headers !== undefined &&
    (!headers || typeof headers !== 'object' || Array.isArray(headers))
  ) {
    throw new ShiprocketError(
      'SHIPROCKET_REQUEST_ERROR',
      'Shiprocket request headers are invalid'
    );
  }

  const { baseURL } = readConfig(env);
  const base = new URL(`${baseURL}/`);
  const basePath = base.pathname.replace(/\/+$/, '');
  const pathWithoutQuery = relativePath.split(/[?#]/, 1)[0];
  if (
    basePath &&
    (pathWithoutQuery === basePath ||
      pathWithoutQuery.startsWith(`${basePath}/`))
  ) {
    throw new ShiprocketError(
      'SHIPROCKET_REQUEST_ERROR',
      'Shiprocket request path must not include the API base path'
    );
  }

  const url = new URL(relativePath.slice(1), base);
  if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`)) {
    throw new ShiprocketError(
      'SHIPROCKET_REQUEST_ERROR',
      'Shiprocket request path must be relative'
    );
  }

  const safeHeaders = Object.fromEntries(
    Object.entries(headers || {}).filter(
      ([name]) => name.toLowerCase() !== 'authorization'
    )
  );
  let token = await getAuthToken({ env, httpClient, now });

  for (let attempt = 0; attempt < MAX_API_OPERATION_ATTEMPTS; attempt += 1) {
    try {
      const response = await httpClient.request({
        method: normalizedMethod,
        url: url.toString(),
        params,
        data,
        headers: { ...safeHeaders, Authorization: `Bearer ${token}` },
        timeout: TIMEOUT_MS,
      });
      return response?.data;
    } catch (error) {
      if (error?.response?.status === 401 && attempt === 0) {
        invalidateAuthToken(token);
        token = await getAuthToken({ env, httpClient, now });
        continue;
      }
      throw requestError(error);
    }
  }
};

module.exports = {
  ShiprocketError,
  TIMEOUT_MS,
  readConfig,
  login,
  getAuthToken,
  invalidateAuthToken,
  shiprocketRequest,
};
