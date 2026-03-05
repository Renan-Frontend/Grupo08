import React from 'react';

const PagePlaceholder = ({ title, icon, description }) => {
  return (
    <div
      style={{
        padding: '2rem',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        textAlign: 'center',
        minHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{icon}</div>
      <h1
        style={{
          fontSize: '2rem',
          color: '#2c3e50',
          marginBottom: '1rem',
          fontWeight: 700,
        }}
      >
        {title}
      </h1>
      <p style={{ color: '#95a5a6', fontSize: '1.1rem' }}>{description}</p>
    </div>
  );
};

export default PagePlaceholder;
