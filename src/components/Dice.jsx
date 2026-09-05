import "./GameUI.css";

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

function Die({ value, rolling }) {
  return (
    <div className={`dice-die ${rolling ? "rolling" : ""}`}>
      <svg viewBox="0 0 100 100">
        <rect x="4" y="4" width="92" height="92" rx="18" fill="#fdf3d9" stroke="#17101f" strokeWidth="5" />
        {(PIPS[value] || []).map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="8" fill="#17101f" />
        ))}
      </svg>
    </div>
  );
}

export default function Dice({ values, rolling, total }) {
  if (!values) return null;

  return (
    <div className="dice-pair">
      {values.map((v, i) => (
        <Die key={i} value={v} rolling={rolling} />
      ))}
      {total !== undefined && <div className="dice-total">= {total}</div>}
    </div>
  );
}
