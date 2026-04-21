import React from 'react';

interface GlassFABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
}

const GlassFAB: React.FC<GlassFABProps> = ({ icon, className = '', style, ...props }) => (
  <button
    className={`fixed bottom-6 right-6 z-50 glass-card p-0 w-16 h-16 flex items-center justify-center rounded-full shadow-lg bg-gradient-to-br from-purple-500 to-fuchsia-500 ${className}`}
    style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', ...style }}
    {...props}
  >
    {icon}
  </button>
);

export default GlassFAB;
