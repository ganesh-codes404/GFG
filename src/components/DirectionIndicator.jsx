import { useEffect, useState } from "react";
import "./GameUI.css";

/**
 * Shows which way turns are moving. `clockwise` should be a boolean; every
 * time it flips, the arrow briefly pulses so the change is obvious instead
 * of just silently updating.
 */
export default function DirectionIndicator({ clockwise }) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(timer);
  }, [clockwise]);

  return (
    <div className={`direction-indicator ${flash ? "flash" : ""}`}>
      <span className={`direction-arrow ${clockwise ? "cw" : "ccw"}`}>
        {clockwise ? "↻" : "↺"}
      </span>
      <span className="direction-label">{clockwise ? "Clockwise" : "Counter-clockwise"}</span>
    </div>
  );
}
