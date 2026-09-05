import "./GameUI.css";

export default function Modal({ children, onClose, className = "" }) {
  return (
    <div className="shared-overlay" onClick={onClose}>
      <div className={`shared-popup ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
