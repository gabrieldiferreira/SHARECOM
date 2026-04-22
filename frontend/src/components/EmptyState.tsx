"use client";

import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4 py-12">
      <div className="w-20 h-20 rounded-full bg-bg-tertiary border border-border flex items-center justify-center mb-6 text-text-muted">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">{title}</h3>
      <p className="text-text-secondary text-center max-w-md mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
