const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Production
  'https://celopong-frontend.vercel.app',
  'https://frontend-next-three-gilt.vercel.app',
  'https://celopong.onrender.com',
];

const ORIGIN_SOURCES = {
  ENV: 'env',
  FALLBACK_ENV: 'fallback-env',
  DEFAULT: 'default',
  WILDCARD: 'wildcard',
};

function normalizeUrl(url) {
  return url?.replace(/\/$/, '') || null;
}

function parseDevOrigins(value) {
  if (!value) {
    return null;
  }
  return value.split(',').map(normalizeUrl).filter(Boolean);
}

/**
 * Returns the effective CORS configuration.
 */
function getCorsOrigins(
  envUrl = process.env.FRONTEND_URL,
  fallbackUrl = process.env.FRONTEND_URL_FALLBACK,
  allowAll = process.env.FRONTEND_URL_ALLOW_ALL === 'true',
  devOverrides = process.env.FRONTEND_URL_DEV_ORIGINS
) {
  if (allowAll) {
    return { origins: true, source: ORIGIN_SOURCES.WILDCARD };
  }

  const normalized = normalizeUrl(envUrl);
  if (normalized) {
    return { origins: [normalized], source: ORIGIN_SOURCES.ENV };
  }

  const fallback = normalizeUrl(fallbackUrl);
  if (fallback) {
    return { origins: [fallback], source: ORIGIN_SOURCES.FALLBACK_ENV };
  }

  const overrideOrigins = parseDevOrigins(devOverrides);
  if (overrideOrigins?.length) {
    return { origins: overrideOrigins, source: ORIGIN_SOURCES.DEFAULT };
  }

  return { origins: DEFAULT_DEV_ORIGINS, source: ORIGIN_SOURCES.DEFAULT };
}

module.exports = {
  ORIGIN_SOURCES,
  getCorsOrigins,
  normalizeUrl,
};
