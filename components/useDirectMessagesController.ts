import { useEffect, useState } from 'react';
import { dmService, type Conversation } from '../services/dmService';
import { identityService } from '../services/identityService';

interface UseDirectMessagesControllerArgs {
  userPubkey: string;
  initialConversationPubkey?: string;
}

export function useDirectMessagesController(args: UseDirectMessagesControllerArgs) {
  const { userPubkey, initialConversationPubkey } = args;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPubkey, setSelectedPubkey] = useState<string | null>(
    initialConversationPubkey || null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const hasLocalIdentity = identityService.hasLocalIdentity();

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      await dmService.fetchMessages();
      setConversations(dmService.getConversations());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!userPubkey) {
      console.warn('DirectMessages: userPubkey is required');
      return;
    }

    dmService.initialize(userPubkey);
    const unsubscribe = dmService.subscribe(() => {
      setConversations(dmService.getConversations());
    });

    void loadConversations();
    dmService.subscribeToMessages();

    return () => {
      unsubscribe();
      dmService.unsubscribeFromMessages();
    };
  }, [userPubkey]);

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
    if (!selectedPubkey) {
      return;
    }

    const message = await dmService.sendMessage({
      recipientPubkey: selectedPubkey,
      content,
    });

    if (message) {
      setConversations(dmService.getConversations());
    }
  };

  const selectedConversation = selectedPubkey ? dmService.getConversation(selectedPubkey) : null;

  return {
    conversations,
    selectedPubkey,
    selectedConversation,
    searchQuery,
    showNewModal,
    isLoading,
    hasLocalIdentity,
    setSearchQuery,
    setSelectedPubkey,
    setShowNewModal,
    handleSelectConversation,
    handleDeleteConversation,
    handleNewConversation,
    handleSendMessage,
  };
}
