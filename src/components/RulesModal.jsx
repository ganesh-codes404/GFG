import Modal from "./Modal";

export default function RulesModal({ title, sections, onClose }) {
  return (
    <Modal onClose={onClose} className="rules-modal">
      <h2>{title}</h2>

      <div className="rules-modal-body">
        {sections.map((section) => (
          <section key={section.heading}>
            <h3>{section.heading}</h3>
            <p>{section.body}</p>
          </section>
        ))}
      </div>

      <button className="shared-button" onClick={onClose}>
        CLOSE
      </button>
    </Modal>
  );
}
