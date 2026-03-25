import { useState, useEffect, lazy, Suspense, Component, type ReactNode } from 'react';
import { Sun, Moon, LogOut } from 'lucide-react';
import { Login } from './components/Login';
import { Chat } from './components/Chat';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { FileBrowser } from './components/FileBrowser';
import { SessionRecording } from './components/SessionRecording';
import { MobileNav } from './components/MobileNav';
import { isAuthenticated, logout, apiFetch, getCurrentUser } from './lib/api';
import { useChat } from './hooks/useChat';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-dvh gap-4 p-8 text-center">
          <h2 className="text-xl font-semibold text-destructive">Something went wrong</h2>
          <p className="text-muted-foreground text-sm max-w-md">{(this.state.error as Error).message}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Terminal = lazy(() => import('./components/Terminal').then((m) => ({ default: m.Terminal })));

type ActiveView = 'chat' | 'dashboard' | 'terminal' | 'settings' | 'files';

function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('srijan_theme') as 'dark' | 'light') ?? 'dark'
  );
  const chat = useChat();

  const currentUser = getCurrentUser();
  const username = currentUser?.username ?? 'admin';
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('srijan_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  const { connect: chatConnect } = chat;
  useEffect(() => {
    if (authed) {
      chatConnect();
    }
  }, [authed, chatConnect]);

  // Derive effective view: redirect chat/files to dashboard when no workspaces exist
  const effectiveView: ActiveView =
    (activeView === 'chat' || activeView === 'files') && chat.workspaces.length === 0
      ? 'dashboard'
      : activeView;

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  const handleCreateWorkspace = async (
    name: string,
    opts?: { cloneUrl?: string; remoteUrl?: string; gitProvider?: string; gitUsername?: string; gitToken?: string }
  ) => {
    await apiFetch('/workspaces', { method: 'POST', body: JSON.stringify({ name, ...opts }) });
    await chat.fetchWorkspaces();
    chat.setCurrentWorkspace(name);
    setActiveView('chat');
  };

  const handleDeleteWorkspace = async (name: string) => {
    await apiFetch(`/workspaces/${name}`, { method: 'DELETE' });
    await chat.fetchWorkspaces();
  };

  const handleViewSessions = (workspace: string) => {
    chat.setCurrentWorkspace(workspace);
    setActiveView('chat');
  };

  const handleReplaySession = (sessionId: string) => {
    setReplaySessionId(sessionId);
  };

  const hasWorkspaces = chat.workspaces.length > 0;

  const navTabs: { id: ActiveView; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'chat', label: 'Chat' },
    { id: 'files', label: 'Files' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'settings', label: 'Settings' },
  ];

  const isTabDisabled = (id: ActiveView) => {
    if (id === 'terminal') return !chat.currentSession;
    if (id === 'chat' || id === 'files') return !hasWorkspaces;
    return false;
  };

  const renderMain = () => {
    // Session replay overrides the current view
    if (replaySessionId) {
      return (
        <SessionRecording
          sessionId={replaySessionId}
          onClose={() => setReplaySessionId(null)}
        />
      );
    }

    switch (effectiveView) {
      case 'dashboard':
        return (
          <Dashboard
            workspaces={chat.workspaces}
            onRefresh={chat.fetchWorkspaces}
            onViewSessions={handleViewSessions}
            onCreateWorkspace={handleCreateWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
          />
        );
      case 'chat':
        return (
          <Chat
            messages={chat.messages}
            sessions={chat.sessions}
            currentSession={chat.currentSession}
            isLoading={chat.isLoading}
            agentStatus={chat.agentStatus}
            sessionActivity={chat.sessionActivity}
            sessionCosts={chat.sessionCosts}
            currentWorkspace={chat.currentWorkspace}
            workspaces={chat.workspaces}
            onSendMessage={chat.sendMessage}
            onNewSession={chat.newSession}
            onJoinSession={chat.joinSession}
            onDeleteSession={chat.deleteSession}
            onWorkspaceChange={chat.setCurrentWorkspace}
            onReplaySession={handleReplaySession}
            onGoToDashboard={() => setActiveView('dashboard')}
            onAbortSession={chat.abortSession}
            activeRole={chat.activeRole}
            agents={chat.agents}
            onCreateAgent={chat.createAgent}
          />
        );
      case 'settings':
        return <Settings open={true} onClose={() => setActiveView('chat')} isAdmin={isAdmin} />;
      case 'files':
        return (
          <FileBrowser
            workspaces={chat.workspaces}
            currentWorkspace={chat.currentWorkspace}
            theme={theme}
          />
        );
      case 'terminal':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading terminal…</div>}>
            <Terminal sessionId={chat.currentSession?.id ?? null} />
          </Suspense>
        );
    }
  };

  return (
    <ErrorBoundary>
    <div className="flex flex-col h-dvh overflow-x-hidden">
      <header className="h-12 md:h-16 flex items-center justify-between px-6 bg-muted border-b-2 border-primary/40 shadow-md shrink-0 z-10">
        <div className="flex items-center gap-5">
          <span className="font-bold text-xl tracking-tight">Srijan</span>
          <nav className="hidden md:flex items-center gap-1">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveView(tab.id); setReplaySessionId(null); }}
                disabled={isTabDisabled(tab.id)}
                className={`px-4 py-2 rounded-lg text-base font-medium transition-colors ${
                  effectiveView === tab.id && !replaySessionId
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg border border-border hover:bg-background/60 transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${chat.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="hidden md:inline text-base text-muted-foreground">
              {chat.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <span className="hidden md:block text-base text-muted-foreground font-medium">{username}</span>
          <button
            onClick={logout}
            aria-label="Logout"
            className="p-2 rounded-lg border border-border hover:bg-background/60 transition-colors md:hidden"
          >
            <LogOut size={18} />
          </button>
          <button
            onClick={logout}
            className="hidden md:block text-base px-4 py-2 rounded-lg border border-border hover:bg-background/60 transition-colors font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden pb-16 md:pb-0">
        {renderMain()}
      </div>

      <MobileNav
        activeView={effectiveView}
        onViewChange={(view) => { setActiveView(view as ActiveView); setReplaySessionId(null); }}
        sessionActivity={chat.sessionActivity}
        hasWorkspaces={chat.workspaces.length > 0}
        hasSession={!!chat.currentSession}
      />
    </div>
    </ErrorBoundary>
  );
}

export default App;
