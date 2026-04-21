import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', style, ...props }) => (
  <div
    className={`glass-card ${className}`}
    style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', ...style }}
    {...props}
  >
    {children}
  </div>
);

export default GlassCard;
