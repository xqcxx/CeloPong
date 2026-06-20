import React, { useRef, useEffect, useCallback } from 'react';

const MOVE_SPEED = 0.05;

export default function TouchControls({ socketRef, isWaiting }) {
  const activeZoneRef = useRef(null);
  const paddleYRef = useRef(0);
  const intervalRef = useRef(null);

  const clearIntervalRef = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startMove = useCallback((zone) => {
    if (isWaiting || !socketRef.current) return;

    activeZoneRef.current = zone;

    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        if (!socketRef.current || !activeZoneRef.current) return;

        const direction = activeZoneRef.current === 'up' ? -1 : 1;
        let newY = paddleYRef.current + direction * MOVE_SPEED;
        newY = Math.max(-1, Math.min(1, newY));
        paddleYRef.current = newY;

        socketRef.current.emit('paddleMove', { position: newY });
      }, 16);
    }
  }, [isWaiting]);

  const stopMove = useCallback(() => {
    activeZoneRef.current = null;
    clearIntervalRef();
  }, [clearIntervalRef]);

  useEffect(() => {
    return () => {
      activeZoneRef.current = null;
      clearIntervalRef();
    };
  }, [clearIntervalRef]);

  const handleTouchStart = (zone) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    startMove(zone);
  };

  const handleTouchEnd = (event) => {
    event.preventDefault();
    stopMove();
  };

  return (
    <div className="touch-controls" aria-label="Touch game controls">
      <button
        type="button"
        className="touch-zone touch-zone-up"
        onTouchStart={handleTouchStart('up')}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        aria-label="Move paddle up"
      >
        <span className="touch-zone-arrow">▲</span>
      </button>
      <button
        type="button"
        className="touch-zone touch-zone-down"
        onTouchStart={handleTouchStart('down')}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        aria-label="Move paddle down"
      >
        <span className="touch-zone-arrow">▼</span>
      </button>
    </div>
  );
}
