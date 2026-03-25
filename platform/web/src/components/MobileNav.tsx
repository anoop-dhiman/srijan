import { LayoutDashboard, MessageSquare, FolderOpen, Terminal as TerminalIcon, Settings } from 'lucide-react';

interface MobileNavProps {
  activeView: string;
  onViewChange: (view: string) => void;
  sessionActivity?: Record<string, { isLoading?: boolean; hasUnread?: boolean }>;
  hasWorkspaces?: boolean;
  hasSession?: boolean;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function MobileNav({ activeView, onViewChange, sessionActivity = {}, hasWorkspaces = false, hasSession = false }: MobileNavProps) {
  const isDisabled = (id: string) => {
    if (id === 'chat' || id === 'files') return !hasWorkspaces;
    if (id === 'terminal') return !hasSession;
    return false;
  };

  const hasChatActivity = Object.values(sessionActivity).some(a => a.isLoading || a.hasUnread);

  return (
    <nav
      role="navigation"
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 bg-background border-t border-border flex justify-around pt-1 md:hidden z-20"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4px)' }}
    >
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = activeView === id;
        const disabled = isDisabled(id);
        const showBadge = id === 'chat' && hasChatActivity;
        return (
          <button
            key={id}
            onClick={() => !disabled && onViewChange(id)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            aria-disabled={disabled}
            className={`relative flex-1 flex flex-col items-center gap-0 py-1.5 transition-colors ${
              disabled
                ? 'opacity-40 cursor-not-allowed'
                : isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={18} />
            {showBadge && (
              <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            )}
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
