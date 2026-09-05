import "./GameUI.css";

/**
 * Renders floating notification chips produced by useNotifications(). If a
 * notification carries a `seat`, the caller is responsible for positioning
 * this component near that seat (e.g. render one instance per seat, filtered
 * by seat); otherwise these stack centrally.
 */
export default function ActionNotification({ notifications }) {
  if (!notifications.length) return null;

  return (
    <div className="action-notification-stack">
      {notifications.map((n) => (
        <div key={n.id} className={`action-notification-chip ${n.tone}`}>
          {n.text}
        </div>
      ))}
    </div>
  );
}
