import { useState, useEffect, lazy, Suspense } from 'react';
import { Login } from './components/Login';
import { Chat } from './components/Chat';
import { Dashboard } from './components/Dashboard';
import { isAuthenticated, logout } from './lib/api';
import { useChat } from './hooks/useChat';

const Terminal = lazy(() => import('./components/Terminal').then((m) => ({ default: m.Terminal })));

type ActiveView = 'chat' | 'dashboard' | 'terminal';

function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const chat = useChat();

  useEffect(() => {
    if (authed) {
      chat.connect();
    }
  }, [authed]);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  const tabs: { id: ActiveView; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'terminal', label: 'Terminal' },
  ];

  return (
    <div className="flex flex-col h-dvh">
      <header className="h-14 flex items-center justify-between px-5 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-bold text-lg tracking-tight">Srijan</span>
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                disabled={tab.id === 'terminal' && !chat.currentSession}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeView === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                chat.isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-muted-foreground">
              {chat.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <span className="text-sm text-muted-foreground font-medium">admin</span>
          <button
            onClick={logout}
            className="text-sm px-3.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b border-border shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            disabled={tab.id === 'terminal' && !chat.currentSession}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              activeView === tab.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground disabled:opacity-40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
        {activeView === 'chat' && (
          <Chat
            messages={chat.messages}
            sessions={chat.sessions}
            currentSession={chat.currentSession}
            isLoading={chat.isLoading}
            agentStatus={chat.agentStatus}
            settingsOpen={settingsOpen}
            sessionCosts={chat.sessionCosts}
            onSendMessage={chat.sendMessage}
            onNewSession={chat.newSession}
            onJoinSession={chat.joinSession}
            onDeleteSession={chat.deleteSession}
            onOpenSettings={() => setSettingsOpen(true)}
            onCloseSettings={() => setSettingsOpen(false)}
          />
        )}

        {activeView === 'dashboard' && <Dashboard />}

        {activeView === 'terminal' && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading terminal…</div>}>
            <Terminal sessionId={chat.currentSession?.id ?? null} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default App;
