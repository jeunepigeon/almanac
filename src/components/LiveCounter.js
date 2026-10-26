import { useEffect, useState, useRef } from 'react';
import { Text } from 'react-native';
import { formatDurationSince, getTickInterval } from '../utils/duration';

export default function LiveCounter({ timestamp, style }) {
  // On initialise depuis le timestamp courant, et le useEffect se déclenche
  // dès que timestamp change ce qui force le recalcul immédiat.
  const [text, setText] = useState(() => formatDurationSince(timestamp));
  const intervalRef = useRef(null);

  useEffect(() => {
    // Calcul immédiat au mount ou au changement de timestamp
    setText(formatDurationSince(timestamp));

    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }

    if (!timestamp) {
      return;
    }

    function tick() {
      setText(formatDurationSince(timestamp));
      const next = getTickInterval(timestamp);
      intervalRef.current = setTimeout(tick, next);
    }

    const next = getTickInterval(timestamp);
    intervalRef.current = setTimeout(tick, next);

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timestamp]);

  return <Text style={style}>{text}</Text>;
}
