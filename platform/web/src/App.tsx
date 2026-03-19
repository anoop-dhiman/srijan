import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { Chat } from './components/Chat';
import { Settings } from './components/Settings';
import { isAuthenticated, logout } from './lib/api';
import { useChat } from './hooks/useChat';

function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chat = useChat();

  useEffect(() => {
    if (authed) {
      chat.connect();
    }
  }, [authed]);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="flex flex-col h-dvh">
      <header className="h-14 flex items-center justify-between px-5 border-b border-border shrink-0">
        <span className="font-bold text-lg tracking-tight">Srijan</span>
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
      <div className="flex flex-1 min-h-0">
        <Chat
          messages={chat.messages}
          sessions={chat.sessions}
          currentSession={chat.currentSession}
          isLoading={chat.isLoading}
          onSendMessage={chat.sendMessage}
          onNewSession={chat.newSession}
          onJoinSession={chat.joinSession}
          onDeleteSession={chat.deleteSession}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;
