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

  const identity = identityService.getIdentity();
  const localPrivateKey = identity?.kind === 'local' ? identity.privkey : null;

  const loadConversations = async (privateKey?: string) => {
    setIsLoading(true);
    try {
      await dmService.fetchMessages({ privateKey });
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

    void loadConversations(localPrivateKey || undefined);
    dmService.subscribeToMessages(localPrivateKey || undefined);

    return () => {
      unsubscribe();
      dmService.unsubscribeFromMessages();
    };
  }, [userPubkey, localPrivateKey]);

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
    if (!selectedPubkey || !localPrivateKey) {
      return;
    }

    const message = await dmService.sendMessage({
      recipientPubkey: selectedPubkey,
      content,
      privateKey: localPrivateKey,
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
    localPrivateKey,
    setSearchQuery,
    setSelectedPubkey,
    setShowNewModal,
    handleSelectConversation,
    handleDeleteConversation,
    handleNewConversation,
    handleSendMessage,
  };
}
