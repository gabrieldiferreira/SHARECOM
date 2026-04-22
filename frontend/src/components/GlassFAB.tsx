import React from 'react';

interface GlassFABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  gradient?: 'purple-pink' | 'blue' | 'green' | 'red';
}

const GlassFAB: React.FC<GlassFABProps> = ({ icon, gradient = 'purple-pink', className = '', style, ...props }) => {
  const gradientMap = {
    'purple-pink': 'from-purple-500 to-fuchsia-500',
    'blue': 'from-blue-500 to-cyan-500',
    'green': 'from-emerald-500 to-green-500',
    'red': 'from-red-500 to-red-600',
  };

  return (
    <button
      className={`fixed bottom-24 md:bottom-6 right-5 md:right-6 z-50 p-0 w-14 h-14 flex items-center justify-center rounded-full shadow-lg bg-gradient-to-br ${gradientMap[gradient]} text-white ${className}`}
      style={{ 
        boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)',
        ...style 
      }}
      {...props}
    >
      {icon}
    </button>
  );
};

export default GlassFAB;
