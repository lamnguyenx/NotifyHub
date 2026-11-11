import { useEffect } from 'react';

import { AppView } from './AppView';
import { useAudio } from './hooks/useAudio';
import { useNotifications } from './hooks/useNotifications';

const submarineAudio = '/audio/Submarine.mp3';

function App() {
  const {
    notifications,
    agentStatus,
    serverInfo,
    hasMore,
    loadingMore,
    liveEventSeq,
    handleDelete,
    handleClearAll,
    loadMore,
    lockedCount,
  } = useNotifications();
  const { play, blocked } = useAudio(submarineAudio);

  // Play only for live SSE arrivals, not for the initial snapshot or an
  // older page loaded by the pagination sentinel.
  useEffect(() => {
    if (liveEventSeq > 0) play();
  }, [liveEventSeq, play]);

  useEffect(() => {
    document.title = blocked
      ? 'Notification Center | Muted. Please click to enable audio notifications'
      : 'Notification Center';
  }, [blocked]);

  return (
    <AppView
      notifications={notifications}
      agentStatus={agentStatus}
      serverInfo={serverInfo}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onDelete={handleDelete}
      onClearAll={handleClearAll}
      onLoadMore={loadMore}
      lockedCount={lockedCount}
      audioBlocked={blocked}
    />
  );
}

export default App;
