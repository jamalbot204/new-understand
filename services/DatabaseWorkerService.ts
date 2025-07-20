// src/services/DatabaseWorkerService.ts
import { ChatSession } from '../types.ts';
import { useToastStore } from '../store/useToastStore.ts';

class WorkerService {
  private worker: Worker;

  constructor() {
    // This special URL syntax is required for Vite to correctly bundle the worker.
    this.worker = new Worker(new URL('../workers/database.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (event) => {
      if (event.data && event.data.type === 'error') {
        console.error('Received error from Database Worker:', event.data.message);
        // Use the toast store to show the error to the user.
        useToastStore.getState().showToast(event.data.message, 'error', 5000);
      }
    };

    this.worker.onerror = (event) => {
        console.error('An unhandled error occurred in DatabaseWorkerService:', event);
        useToastStore.getState().showToast('A critical error occurred in the background save process.', 'error', 5000);
        event.preventDefault();
    };
  }

  /**
   * Saves a single chat session by sending it to the Web Worker.
   * This is a "fire-and-forget" operation from the main thread's perspective.
   * @param session The ChatSession object to save.
   */
  public saveSession(session: ChatSession): void {
    if (!this.worker) {
        console.error("Database worker is not initialized.");
        return;
    }
    // The object is cloned automatically when sent to the worker.
    this.worker.postMessage(session);
  }
}

// Export a singleton instance of the service.
export const DatabaseWorkerService = new WorkerService();
