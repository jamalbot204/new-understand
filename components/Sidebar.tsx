// src/components/Sidebar.tsx
import React, { useRef, useEffect, memo, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore.ts';
import { useChatStore } from '../stores/chatStore.ts';
import { useUIStore } from '../stores/uiStore.ts';
import { APP_TITLE } from '../constants.ts';
import { PlusIcon, TrashIcon, CogIcon, ExportIcon, ImportIcon, UsersIcon, IconDirectionLtr, IconDirectionRtl, PencilIcon, CheckIcon, XCircleIcon, DocumentDuplicateIcon } from './Icons.tsx';

const Sidebar: React.FC = memo(() => {
  const { chatHistory, currentChatId, editingTitleInfo } = useSessionStore();
  const currentChatSession = useSessionStore(state => state.chatHistory.find(s => s.id === state.currentChatId));
  const {
      handleNewChat,
      handleSelectChat, handleStartEditChatTitle, handleSaveChatTitle,
      handleCancelEditChatTitle, handleEditTitleInputChange, handleDuplicateChat,
      handleDeleteChat,
  } = useSessionStore(state => state.actions);
  const { toggleCharacterMode, importAll } = useChatStore(state => state.actions);
  const { layoutDirection } = useUIStore();
  const { handleToggleLayoutDirection, openExportConfigurationModal, openSettingsPanel } = useUIStore(state => state.actions);
  
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitleInfo.id && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTitleInfo.id]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveChatTitle();
    } else if (e.key === 'Escape') {
      handleCancelEditChatTitle();
    }
  }, [handleSaveChatTitle, handleCancelEditChatTitle]);

  return (
    <div className="w-72 aurora-panel h-full flex flex-col border-r border-[var(--aurora-border)]">
      <div className="p-4 border-b border-[var(--aurora-border)] flex justify-between items-center">
        <h1 className="text-xl font-semibold text-gray-100">{APP_TITLE}</h1>
        <button
          onClick={handleToggleLayoutDirection}
          title={layoutDirection === 'rtl' ? "Switch to Left-to-Right" : "Switch to Right-to-Left"}
          className="p-1.5 text-[var(--aurora-text-secondary)] hover:text-[var(--aurora-text-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)] focus:outline-none focus:ring-2 ring-[var(--aurora-accent-primary)]"
          aria-label={layoutDirection === 'rtl' ? "Switch to Left-to-Right layout" : "Switch to Right-to-Left layout"}
        >
          {layoutDirection === 'rtl' ? <IconDirectionLtr className="w-5 h-5" /> : <IconDirectionRtl className="w-5 h-5" />}
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex space-x-2">
            <button
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] focus:outline-none focus:ring-2 ring-[var(--aurora-accent-primary)]"
            >
            <PlusIcon className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0" /> 
            New Chat
            </button>
            <button
                onClick={toggleCharacterMode}
                disabled={!currentChatId}
                title={currentChatSession?.isCharacterModeActive ? "Disable Character Mode" : "Enable Character Mode"}
                className={`p-2.5 text-sm font-medium rounded-md transition-shadow focus:outline-none focus:ring-2 focus:ring-opacity-50
                            ${currentChatSession?.isCharacterModeActive 
                                ? 'bg-[var(--aurora-accent-secondary)] text-white ring-[var(--aurora-accent-secondary)] hover:shadow-[0_0_12px_2px_rgba(156,51,245,0.6)]' 
                                : 'bg-white/5 text-[var(--aurora-text-secondary)] ring-white/20 hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]'}
                            ${!currentChatId ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <UsersIcon className="w-5 h-5" />
            </button>
        </div>
        <div className="flex space-x-2 rtl:space-x-reverse">
            <button
                onClick={openExportConfigurationModal}
                title="Export Selected Chats"
                className="w-full flex items-center justify-center px-3 py-2 text-xs font-medium text-[var(--aurora-text-secondary)] bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]"
            >
                <ExportIcon className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                Export
            </button>
            <button
                onClick={importAll}
                title="Import Chats"
                className="w-full flex items-center justify-center px-3 py-2 text-xs font-medium text-[var(--aurora-text-secondary)] bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]"
            >
                <ImportIcon className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                Import
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <h2 className="text-xs font-semibold text-[var(--aurora-text-secondary)] uppercase tracking-wider mb-2">History</h2>
        {chatHistory.length === 0 && (
          <p className="text-sm text-gray-400 italic">No chats yet.</p>
        )}
        {chatHistory.map(session => (
          <div key={session.id}
            className={`group relative rounded-md transition-all ${currentChatId === session.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
          >
            {editingTitleInfo.id === session.id ? (
              <div className="flex items-center p-2.5">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitleInfo.value}
                  onChange={(e) => handleEditTitleInputChange(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={handleSaveChatTitle}
                  className="flex-grow bg-transparent focus:bg-black/20 text-sm p-1 -ml-1 rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--aurora-accent-primary)]"
                />
                <button onClick={handleSaveChatTitle} className="p-1 text-green-400 hover:text-green-300"><CheckIcon className="w-4 h-4" /></button>
                <button onClick={handleCancelEditChatTitle} className="p-1 text-red-400 hover:text-red-300"><XCircleIcon className="w-4 h-4" /></button>
              </div>
            ) : (
              <button
                onClick={() => handleSelectChat(session.id)}
                className="w-full text-left p-2.5 text-sm truncate flex items-center"
                title={session.title}
              >
                {session.isCharacterModeActive && <UsersIcon className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0 flex-shrink-0 text-purple-400" />}
                <span className="flex-grow truncate">{session.title}</span>
                <div className="flex-shrink-0 flex items-center space-x-1 rtl:space-x-reverse ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); handleStartEditChatTitle(session.id, session.title); }} className="p-1 hover:text-white" title="Rename"><PencilIcon className="w-4 h-4"/></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDuplicateChat(session.id); }} className="p-1 hover:text-white" title="Duplicate"><DocumentDuplicateIcon className="w-4 h-4"/></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteChat(session.id); }} className="p-1 hover:text-red-400" title="Delete"><TrashIcon className="w-4 h-4"/></button>
                </div>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-[var(--aurora-border)]">
        <button
          onClick={openSettingsPanel}
          className="w-full flex items-center p-2.5 text-sm text-[var(--aurora-text-secondary)] rounded-md transition-shadow hover:bg-white/5 hover:text-white"
        >
          <CogIcon className="w-5 h-5 mr-3 rtl:ml-3 rtl:mr-0" />
          Settings
        </button>
      </div>
    </div>
  );
});

export default Sidebar;
