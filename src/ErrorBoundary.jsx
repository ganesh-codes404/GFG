import { Component } from "react";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  overflow: "auto",
  padding: "24px",
  background: "#1a0f28",
  color: "#ffb4b4",
  fontFamily: "monospace",
  fontSize: "14px",
  whiteSpace: "pre-wrap",
};

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render crashed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={overlayStyle}>
        <h1 style={{ color: "#ff6b6b", marginBottom: 12 }}>
          Something crashed while rendering.
        </h1>
        {String(this.state.error?.stack || this.state.error)}
      </div>
    );
  }
}
