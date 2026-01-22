import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MessageCircle, Send, ArrowLeft, User, Trash2, Check, CheckCheck, Lock, Search, Plus, ChevronUp } from 'lucide-react';
import { dmService, type Conversation, type DirectMessage } from '../services/dmService';
import { nostrService as _nostrService } from '../services/nostr/NostrService';

// Pagination constants
const CONVERSATIONS_PAGE_SIZE = 20;
const MESSAGES_PAGE_SIZE = 50;

// ============================================
// TYPES
// ============================================

interface DirectMessagesProps {
  userPubkey: string;
  onClose: () => void;
  initialConversationPubkey?: string;
}

// ============================================
// CONVERSATION LIST
// ============================================

const ConversationList: React.FC<{
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (pubkey: string) => void;
  onNewConversation: () => void;
  onDelete: (pubkey: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}> = ({ conversations, selectedId, onSelect, onNewConversation, onDelete, searchQuery, onSearchChange }) => {
  const [visibleCount, setVisibleCount] = useState(CONVERSATIONS_PAGE_SIZE);

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      if (!searchQuery) return true;
      const name = conv.participantName || conv.participantPubkey;
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [conversations, searchQuery]);

  const visibleConversations = filteredConversations.slice(0, visibleCount);
  const hasMore = filteredConversations.length > visibleCount;

  // Reset pagination when search changes
  useEffect(() => {
    setVisibleCount(CONVERSATIONS_PAGE_SIZE);
  }, [searchQuery]);

  return (
    <div className="flex flex-col h-full border-r border-terminal-dim">
      {/* Header */}
      <div className="p-4 border-b border-terminal-dim">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-terminal-text flex items-center gap-2">
            <MessageCircle size={20} />
            MESSAGES
            <span className="text-xs text-terminal-dim font-normal">
              ({filteredConversations.length})
            </span>
          </h2>
          <button
            onClick={onNewConversation}
            className="p-2 border border-terminal-dim hover:border-terminal-text hover:bg-terminal-dim/20 transition-colors"
            title="New Message"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-terminal-dim" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-terminal-bg border border-terminal-dim pl-8 pr-3 py-2 text-sm focus:border-terminal-text focus:outline-none"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {visibleConversations.length === 0 ? (
          <div className="p-4 text-center text-terminal-dim text-sm">
            {searchQuery ? 'No conversations found' : 'No messages yet'}
          </div>
        ) : (
          <>
            {visibleConversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedId === conv.id}
                onSelect={() => onSelect(conv.participantPubkey)}
                onDelete={() => onDelete(conv.participantPubkey)}
              />
            ))}

            {/* Load more button */}
            {hasMore && (
              <button
                onClick={() => setVisibleCount(v => v + CONVERSATIONS_PAGE_SIZE)}
                className="w-full py-3 text-xs text-terminal-dim hover:text-terminal-text border-t border-terminal-dim/30 transition-colors uppercase"
              >
                Load {Math.min(CONVERSATIONS_PAGE_SIZE, filteredConversations.length - visibleCount)} older conversations
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ============================================
// CONVERSATION ITEM
// ============================================

const ConversationItem: React.FC<{
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ conversation, isSelected, onSelect, onDelete }) => {
  const displayName = conversation.participantName ||
    (conversation.participantPubkey ? `${conversation.participantPubkey.slice(0, 8)}...` : 'Unknown');

  const lastMessagePreview = conversation.lastMessage?.content.slice(0, 40) || '';
  const lastMessageTime = conversation.lastMessage 
    ? formatTimestamp(conversation.lastMessage.timestamp)
    : '';

  return (
    <div
      onClick={onSelect}
      className={`
        p-3 border-b border-terminal-dim/50 cursor-pointer transition-colors
        ${isSelected ? 'bg-terminal-dim/30' : 'hover:bg-terminal-dim/10'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full border border-terminal-dim flex items-center justify-center bg-terminal-dim/20 flex-shrink-0">
          {conversation.participantAvatar ? (
            <img 
              src={conversation.participantAvatar} 
              alt={displayName}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <User size={18} className="text-terminal-dim" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-bold text-terminal-text truncate">
              {displayName}
            </span>
            <span className="text-xs text-terminal-dim flex-shrink-0">
              {lastMessageTime}
            </span>
          </div>
          
          <div className="flex items-center justify-between mt-1">
            <p className="text-sm text-terminal-dim truncate">
              {conversation.lastMessage?.isSent && (
                <span className="mr-1">
                  {conversation.lastMessage.isRead ? (
                    <CheckCheck size={12} className="inline" />
                  ) : (
                    <Check size={12} className="inline" />
                  )}
                </span>
              )}
              {lastMessagePreview}
              {lastMessagePreview.length < (conversation.lastMessage?.content.length || 0) && '...'}
            </p>
            
            {conversation.unreadCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-terminal-text text-black text-xs font-bold rounded-full">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Delete button (on hover) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 opacity-0 hover:opacity-100 focus:opacity-100 text-terminal-alert hover:bg-terminal-alert/20 transition-all"
          title="Delete conversation"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

// ============================================
// CHAT VIEW
// ============================================

const ChatView: React.FC<{
  conversation: Conversation;
  currentUserPubkey: string;
  onSendMessage: (content: string) => void;
  onBack: () => void;
}> = ({ conversation, currentUserPubkey, onSendMessage, onBack }) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MESSAGES_PAGE_SIZE);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollHeightBeforeRef = useRef<number | null>(null);

  const displayName = conversation.participantName ||
    (conversation.participantPubkey ? `${conversation.participantPubkey.slice(0, 8)}...` : 'Unknown');

  // Get visible messages (most recent N)
  const allMessages = conversation.messages;
  const totalMessages = allMessages.length;
  const visibleMessages = useMemo(() => {
    // Show the most recent N messages
    const startIndex = Math.max(0, totalMessages - visibleCount);
    return allMessages.slice(startIndex);
  }, [allMessages, totalMessages, visibleCount]);

  const hasEarlierMessages = totalMessages > visibleCount;

  // Handle loading earlier messages
  const handleLoadEarlier = () => {
    const container = messagesContainerRef.current;
    if (container) {
      // Store scroll height before state update
      scrollHeightBeforeRef.current = container.scrollHeight;
    }
    setVisibleCount(v => v + MESSAGES_PAGE_SIZE);
  };

  // Preserve scroll position after loading earlier messages
  // This runs after React commits DOM updates
  useEffect(() => {
    if (scrollHeightBeforeRef.current !== null) {
      const container = messagesContainerRef.current;
      if (container) {
        // Use double requestAnimationFrame to ensure DOM is fully updated
        // First RAF: wait for React to commit
        requestAnimationFrame(() => {
          // Second RAF: wait for browser to paint
          requestAnimationFrame(() => {
            const scrollHeightAfter = container.scrollHeight;
            const scrollHeightBefore = scrollHeightBeforeRef.current!;
            container.scrollTop = scrollHeightAfter - scrollHeightBefore;
            scrollHeightBeforeRef.current = null;
          });
        });
      }
    }
  }, [visibleCount]);

  // Scroll to bottom when new messages arrive (but not when loading earlier)
  useEffect(() => {
    // Only auto-scroll if we're near the bottom
    const container = messagesContainerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [conversation.messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation.id]);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    
    setIsSending(true);
    try {
      onSendMessage(message.trim());
      setMessage('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-terminal-dim flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 hover:bg-terminal-dim/20 transition-colors md:hidden"
        >
          <ArrowLeft size={20} />
        </button>
        
        <div className="w-10 h-10 rounded-full border border-terminal-dim flex items-center justify-center bg-terminal-dim/20">
          {conversation.participantAvatar ? (
            <img 
              src={conversation.participantAvatar} 
              alt={displayName}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <User size={18} className="text-terminal-dim" />
          )}
        </div>
        
        <div className="flex-1">
          <h3 className="font-bold text-terminal-text">{displayName}</h3>
          <p className="text-xs text-terminal-dim flex items-center gap-1">
            <Lock size={10} />
            End-to-end encrypted
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Load earlier messages button */}
        {hasEarlierMessages && (
          <button
            onClick={handleLoadEarlier}
            className="w-full py-2 mb-3 text-xs text-terminal-dim hover:text-terminal-text border border-terminal-dim/30 hover:border-terminal-text transition-colors uppercase flex items-center justify-center gap-2"
          >
            <ChevronUp size={14} />
            Load {Math.min(MESSAGES_PAGE_SIZE, totalMessages - visibleCount)} earlier messages
            <span className="text-terminal-dim/50">
              (showing {visibleMessages.length} of {totalMessages})
            </span>
          </button>
        )}

        {visibleMessages.length === 0 ? (
          <div className="text-center text-terminal-dim py-8">
            <Lock size={32} className="mx-auto mb-2 opacity-50" />
            <p>Start an encrypted conversation with {displayName}</p>
          </div>
        ) : (
          visibleMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isSent={msg.senderPubkey === currentUserPubkey}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-terminal-dim">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-terminal-bg border border-terminal-dim p-3 text-terminal-text focus:border-terminal-text focus:outline-none resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            className="px-4 bg-terminal-text text-black font-bold hover:bg-terminal-dim hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-xs text-terminal-dim mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
};

// ============================================
// MESSAGE BUBBLE
// ============================================

const MessageBubble: React.FC<{
  message: DirectMessage;
  isSent: boolean;
}> = ({ message, isSent }) => {
  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[75%] p-3 rounded-lg
          ${isSent 
            ? 'bg-terminal-text text-black rounded-br-none' 
            : 'bg-terminal-dim/30 border border-terminal-dim rounded-bl-none'
          }
        `}
      >
        <p className="whitespace-pre-wrap break-words">
          {message.isDecrypted ? message.content : (
            <span className="italic opacity-70 flex items-center gap-1">
              <Lock size={12} />
              {message.content}
            </span>
          )}
        </p>
        <div className={`
          flex items-center gap-1 mt-1 text-xs
          ${isSent ? 'text-black/60 justify-end' : 'text-terminal-dim'}
        `}>
          <span>{formatTimestamp(message.timestamp)}</span>
          {isSent && (
            message.isRead ? (
              <CheckCheck size={12} />
            ) : (
              <Check size={12} />
            )
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// NEW CONVERSATION MODAL
// ============================================

const NewConversationModal: React.FC<{
  onStart: (pubkey: string) => void;
  onClose: () => void;
}> = ({ onStart, onClose }) => {
  const [pubkey, setPubkey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    const trimmed = pubkey.trim();
    
    // Basic validation - should be 64 hex chars
    if (!/^[a-fA-F0-9]{64}$/.test(trimmed)) {
      setError('Invalid public key. Must be 64 hex characters.');
      return;
    }

    onStart(trimmed.toLowerCase());
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-terminal-bg border-2 border-terminal-text p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <MessageCircle size={20} />
          NEW_MESSAGE
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-terminal-dim uppercase font-bold mb-1">
              Recipient Public Key (hex)
            </label>
            <input
              type="text"
              value={pubkey}
              onChange={(e) => {
                setPubkey(e.target.value);
                setError(null);
              }}
              placeholder="64-character hex public key..."
              className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text focus:border-terminal-text focus:outline-none font-mono text-sm"
            />
            {error && (
              <p className="text-terminal-alert text-xs mt-1">* {error}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleStart}
              disabled={!pubkey.trim()}
              className="flex-1 bg-terminal-text text-black font-bold py-3 hover:bg-terminal-dim hover:text-white transition-colors disabled:opacity-50"
            >
              [ START_CHAT ]
            </button>
            <button
              onClick={onClose}
              className="px-6 border border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text transition-colors"
            >
              [ CANCEL ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const DirectMessages: React.FC<DirectMessagesProps> = ({
  userPubkey,
  onClose,
  initialConversationPubkey,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPubkey, setSelectedPubkey] = useState<string | null>(
    initialConversationPubkey || null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize DM service
  useEffect(() => {
    if (!userPubkey) {
      console.warn('DirectMessages: userPubkey is required');
      return;
    }
    dmService.initialize(userPubkey);
    loadConversations();
    
    return () => {
      // Don't cleanup on unmount - keep conversations cached
    };
  }, [userPubkey]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      await dmService.fetchMessages();
      setConversations(dmService.getConversations());
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectConversation = (pubkey: string) => {
    setSelectedPubkey(pubkey);
    dmService.markConversationAsRead(pubkey);
    setConversations(dmService.getConversations());
  };

  const handleDeleteConversation = (pubkey: string) => {
    if (confirm('Delete this conversation? Messages cannot be recovered.')) {
      dmService.deleteConversation(pubkey);
      setConversations(dmService.getConversations());
      if (selectedPubkey === pubkey) {
        setSelectedPubkey(null);
      }
    }
  };

  const handleNewConversation = (pubkey: string) => {
    dmService.startConversation(pubkey);
    setConversations(dmService.getConversations());
    setSelectedPubkey(pubkey);
    setShowNewModal(false);
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedPubkey) return;
    
    // For now, just add to local state
    // Full implementation would require signing with private key
    const message = await dmService.sendMessage({
      recipientPubkey: selectedPubkey,
      content,
      privateKey: '', // Would be provided by identityService
    });
    
    if (message) {
      setConversations(dmService.getConversations());
    }
  };

  const selectedConversation = selectedPubkey 
    ? dmService.getConversation(selectedPubkey)
    : null;

  return (
    <div className="fixed inset-0 bg-terminal-bg z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-terminal-dim">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Lock size={20} />
          ENCRYPTED_MESSAGES
        </h1>
        <button
          onClick={onClose}
          className="px-4 py-2 border border-terminal-dim hover:border-terminal-alert hover:text-terminal-alert transition-colors"
        >
          [ CLOSE ]
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List - hidden on mobile when chat is open */}
        <div className={`
          w-full md:w-80 lg:w-96 flex-shrink-0
          ${selectedConversation ? 'hidden md:flex' : 'flex'}
          flex-col
        `}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedPubkey}
            onSelect={handleSelectConversation}
            onNewConversation={() => setShowNewModal(true)}
            onDelete={handleDeleteConversation}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        {/* Chat View */}
        <div className={`
          flex-1 flex flex-col
          ${selectedConversation ? 'flex' : 'hidden md:flex'}
        `}>
          {selectedConversation ? (
            <ChatView
              conversation={selectedConversation}
              currentUserPubkey={userPubkey}
              onSendMessage={handleSendMessage}
              onBack={() => setSelectedPubkey(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-terminal-dim">
              <div className="text-center">
                <MessageCircle size={48} className="mx-auto mb-4 opacity-50" />
                <p>Select a conversation or start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-terminal-bg/80 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-pulse text-2xl mb-2">📡</div>
            <p className="text-terminal-dim">Loading messages...</p>
          </div>
        </div>
      )}

      {/* New Conversation Modal */}
      {showNewModal && (
        <NewConversationModal
          onStart={handleNewConversation}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Today - show time only
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  // Within a week - show day name
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  
  // Older - show date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default DirectMessages;
