import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { Chat } from './components/Chat';
import { Settings } from './components/Settings';
import { isAuthenticated } from './lib/api';
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
    <>
      <Chat
        messages={chat.messages}
        sessions={chat.sessions}
        currentSession={chat.currentSession}
        isConnected={chat.isConnected}
        isLoading={chat.isLoading}
        onSendMessage={chat.sendMessage}
        onNewSession={chat.newSession}
        onJoinSession={chat.joinSession}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default App;
