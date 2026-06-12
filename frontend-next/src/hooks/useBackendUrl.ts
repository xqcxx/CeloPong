import { useMemo } from 'react';
import { BACKEND_URL, BACKEND_URL_SOURCE } from '../constants';

export default function useBackendUrl() {
  return useMemo(
    () => ({
      url: BACKEND_URL,
      source: BACKEND_URL_SOURCE,
    }),
    []
  );
}
