import React from "react";
import { Link } from "react-router-dom";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          color: '#1e1b4b',
          background: 'rgba(255, 255, 255, 0.85)',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 10px 30px rgba(16, 24, 40, 0.04)',
          backdropFilter: 'blur(12px)',
          margin: '20px'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: '#fff1f2',
            color: '#e11d48',
            borderRadius: '16px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '28px',
            margin: '0 auto 20px'
          }}>
            ⚠️
          </div>
          <h2 style={{ margin: '0 0 12px', fontWeight: 900 }}>Something went wrong</h2>
          <p style={{ color: '#64748b', marginBottom: '24px' }}>
            We encountered an unexpected error loading this module.<br/>
            Our team has been notified.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #58158f, #9b24ff)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              marginRight: '12px'
            }}
          >
            Refresh Page
          </button>
          <Link 
            to="/"
            style={{
              padding: '12px 24px',
              background: '#f3ebff',
              color: '#6f1dce',
              textDecoration: 'none',
              borderRadius: '12px',
              fontWeight: 800,
              display: 'inline-block'
            }}
          >
            Go Home
          </Link>
        </div>
      );
    }

    return this.props.children;
  }
}
