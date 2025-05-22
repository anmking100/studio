import { BrainCircuit } from 'lucide-react';
import Link from 'next/link';

export function Logo({ size = 'md', collapsed = false }: { size?: 'sm' | 'md' | 'lg', collapsed?: boolean }) {
  const iconSize = size === 'lg' ? 32 : size === 'md' ? 24 : 20;
  const textSizeClass = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-xl' : 'text-lg';

  return (
    <Link href="/dashboard" className="flex items-center gap-2 text-primary hover:text-primary/90 transition-colors">
      <BrainCircuit size={iconSize} className="text-accent" />
      {!collapsed && (
        <span className={`font-bold ${textSizeClass} text-foreground`}>FocusFlow</span>
      )}
    </Link>
  );
}
