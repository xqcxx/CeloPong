import { useEffect, useState, useMemo } from 'react';
import io from 'socket.io-client';
import { BACKEND_URL, SOCKET_EVENTS, LEADERBOARD_LIMIT } from '../constants';

// Subscribes to leaderboard updates via WebSocket while providing initial HTTP data
export default function useLeaderboardSubscription() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const socket = useMemo(
    () =>
      io(BACKEND_URL, {
        withCredentials: true,
        transports: ['websocket'],
      }),
    []
  );

  useEffect(() => {
    const handleLiveUpdate = (payload) => {
      setLeaderboard(payload);
      setIsLoading(false);
    };

    socket.on('connect', () => {
      socket.emit(SOCKET_EVENTS.GET_LEADERBOARD);
    });

    socket.on(SOCKET_EVENTS.LEADERBOARD_UPDATE, handleLiveUpdate);
    socket.on(SOCKET_EVENTS.LEGACY_RANKINGS_UPDATE, handleLiveUpdate);

    return () => {
      socket.off(SOCKET_EVENTS.LEADERBOARD_UPDATE, handleLiveUpdate);
      socket.off(SOCKET_EVENTS.LEGACY_RANKINGS_UPDATE, handleLiveUpdate);
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    let isMounted = true;

    async function fetchInitialLeaderboard() {
      try {
        const response = await fetch(`${BACKEND_URL}/api/rankings/top?limit=${LEADERBOARD_LIMIT}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Failed to load leaderboard: ${response.status}`);
        }

        const data = await response.json();
        if (isMounted) {
          setLeaderboard(data);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[Leaderboard] initial fetch failed', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchInitialLeaderboard();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    leaderboard,
    isLoading,
    socket,
  };
}
