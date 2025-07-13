import { create } from 'zustand';
import { useActiveChatStore } from './useActiveChatStore';
import { useToastStore } from './useToastStore';
import { useModalStore } from './useModalStore';
import { ChatMessage, ChatMessageRole } from '../types';

interface GithubState {
  isLoading: boolean;
  error: string | null;
}

interface GithubActions {
  setGithubRepo: (url: string | null) => Promise<void>;
}

export const useGithubStore = create<GithubState & GithubActions>((set) => ({
  isLoading: false,
  error: null,

  setGithubRepo: async (url: string | null) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    const showToast = useToastStore.getState().showToast;
    const { closeGitHubImportModal } = useModalStore.getState();

    if (!currentChatSession) {
      showToast("No active chat session.", "error");
      return;
    }

    set({ isLoading: true, error: null });

    if (url === null) {
      await updateCurrentChatSession(session => session ? ({
        ...session,
        githubRepoContext: null,
        messages: [...session.messages, {
          id: `msg-${Date.now()}-system`,
          role: ChatMessageRole.SYSTEM,
          content: "GitHub repository context has been removed.",
          timestamp: new Date()
        }]
      }) : null);
      showToast("GitHub repository context removed.", "success");
      set({ isLoading: false });
      return;
    }

    closeGitHubImportModal();
    const processingMessage: ChatMessage = {
      id: `msg-${Date.now()}-system-processing`,
      role: ChatMessageRole.SYSTEM,
      content: `Processing GitHub repository: ${url}...`,
      timestamp: new Date()
    };
    await updateCurrentChatSession(session => session ? ({
      ...session,
      messages: [...session.messages, processingMessage]
    }) : null);

    try {
      const cleanUrlString = url.endsWith('.git') ? url.slice(0, -4) : url;
      const urlObject = new URL(cleanUrlString);
      const urlParts = urlObject.pathname.split('/').filter(Boolean);
      if (urlParts.length < 2) throw new Error("Invalid GitHub URL format.");
      const [owner, repo] = urlParts;

      let contextBuilder = "Here is the code I would like to discuss:\n\n";
      let fetchedFilesCount = 0;

      const fetchDirectoryContents = async (path: string): Promise<void> => {
        const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const response = await fetch(contentsUrl);
        if (!response.ok) {
          console.warn(`Could not fetch directory: ${path}`);
          return;
        }
        const contents: any[] = await response.json();
        for (const item of contents) {
          if (item.type === 'file' && item.download_url) {
            try {
              const contentResponse = await fetch(item.download_url);
              if (contentResponse.ok) {
                const content = await contentResponse.text();
                contextBuilder += `--- FILE: ${item.path} ---\n\n${content}\n\n`;
                fetchedFilesCount++;
              }
            } catch (fileFetchError) {
              console.warn(`Could not fetch file: ${item.path}`, fileFetchError);
            }
          } else if (item.type === 'dir') {
            await fetchDirectoryContents(item.path);
          }
        }
      };

      await fetchDirectoryContents('');

      if (fetchedFilesCount === 0) {
        throw new Error("Could not fetch any readable files from the repository.");
      }

      const finalContextMessage: ChatMessage = {
        id: `msg-${Date.now()}-system-complete`,
        role: ChatMessageRole.SYSTEM,
        content: `GitHub context created from ${fetchedFilesCount} file(s). You can now ask questions.`,
        timestamp: new Date()
      };

      await updateCurrentChatSession(session => session ? ({
        ...session,
        githubRepoContext: { url: cleanUrlString, contextText: contextBuilder },
        messages: [...session.messages.filter(m => m.id !== processingMessage.id), finalContextMessage]
      }) : null);
      showToast("GitHub repository context loaded!", "success");
      set({ isLoading: false });

    } catch (error: any) {
      const errorMessage = `Error loading GitHub context: ${error.message}`;
      set({ isLoading: false, error: errorMessage });
      console.error("Error processing GitHub repo:", error);

      const errorSystemMessage: ChatMessage = {
        id: `msg-${Date.now()}-system-error`,
        role: ChatMessageRole.SYSTEM,
        content: errorMessage,
        timestamp: new Date()
      };
      await updateCurrentChatSession(session => session ? ({
        ...session,
        messages: [...session.messages.filter(m => m.id !== processingMessage.id), errorSystemMessage]
      }) : null);
      showToast(errorMessage, "error");
    }
  },
}));
