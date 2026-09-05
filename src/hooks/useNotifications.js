import { useCallback, useRef, useState } from "react";

/**
 * Floating action notifications (e.g. "+4", "BLOCKED", "-₹5,000") that
 * appear near a player and auto-dismiss. push() returns nothing -- fire and
 * forget; the notification removes itself.
 */
export function useNotifications(lifespanMs = 2200) {
  const [notifications, setNotifications] = useState([]);
  const idRef = useRef(0);

  const push = useCallback(
    (text, { tone = "default", seat = null } = {}) => {
      const id = idRef.current++;
      setNotifications((current) => [...current, { id, text, tone, seat }]);
      setTimeout(() => {
        setNotifications((current) => current.filter((n) => n.id !== id));
      }, lifespanMs);
    },
    [lifespanMs]
  );

  return { notifications, push };
}
