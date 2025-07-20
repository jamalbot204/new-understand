// src/workers/database.worker.ts
import { addOrUpdateChatSession } from '../services/dbService.ts';
import { ChatSession } from '../types.ts';

self.onmessage = async (event: MessageEvent<ChatSession>) => {
  const sessionToSave = event.data;

  if (!sessionToSave || !sessionToSave.id) {
    console.error('Database worker received invalid session data.');
    // Optionally post an error back
    self.postMessage({
      type: 'error',
      message: 'Worker received invalid session data.',
    });
    return;
  }

  try {
    await addOrUpdateChatSession(sessionToSave);
    // Success is silent, no need to post a message back.
  } catch (error: any) {
    console.error('Error in database worker while saving session:', error);
    // Post a structured error message back to the main thread.
    self.postMessage({
      type: 'error',
      message: `Failed to save session "${sessionToSave.title}": ${error.message || 'Unknown DB error'}`,
    });
  }
};

// Add a handler for any unhandled errors within the worker
self.onerror = (event) => {
    console.error('Unhandled error in database worker:', event);
    self.postMessage({
        type: 'error',
        message: 'An unexpected error occurred in the database worker.',
    });
};
