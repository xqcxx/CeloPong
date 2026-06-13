const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // Production
  'https://celopong-frontend.vercel.app',
  'https://frontend-rosy-iota-16.vercel.app',
  'https://frontend-next-three-gilt.vercel.app',
  'https://celopong.onrender.com',
];

const ORIGIN_SOURCES = {
  ENV: 'env',
  FALLBACK_ENV: 'fallback-env',
  COMBINED: 'combined',
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

function mergeOrigins(...originLists) {
  const merged = [];

  originLists.flat().filter(Boolean).forEach((origin) => {
    if (!merged.includes(origin)) {
      merged.push(origin);
    }
  });

  return merged;
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

  const overrideOrigins = parseDevOrigins(devOverrides);
  const envOrigins = parseDevOrigins(envUrl);
  const fallbackOrigins = parseDevOrigins(fallbackUrl);

  if (envOrigins?.length || fallbackOrigins?.length || overrideOrigins?.length) {
    const origins = mergeOrigins(
      envOrigins,
      fallbackOrigins,
      overrideOrigins,
      DEFAULT_DEV_ORIGINS
    );

    const source = envOrigins?.length
      ? ORIGIN_SOURCES.COMBINED
      : fallbackOrigins?.length
        ? ORIGIN_SOURCES.FALLBACK_ENV
        : ORIGIN_SOURCES.DEFAULT;

    return { origins, source };
  }

  return { origins: DEFAULT_DEV_ORIGINS, source: ORIGIN_SOURCES.DEFAULT };
}

module.exports = {
  ORIGIN_SOURCES,
  getCorsOrigins,
  mergeOrigins,
  normalizeUrl,
};
