import { LayoutDashboard, MessageSquare, FolderOpen, Terminal as TerminalIcon, Settings } from 'lucide-react';

interface MobileNavProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function MobileNav({ activeView, onViewChange }: MobileNavProps) {
  return (
    <nav
      role="navigation"
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 bg-background border-t border-border flex justify-around py-2 md:hidden z-20"
    >
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = activeView === id;
        return (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
