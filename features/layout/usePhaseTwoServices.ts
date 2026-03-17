import { useEffect } from 'react';
import { dmService } from '../../services/dmService';
import { followServiceV2 } from '../../services/followServiceV2';
import { notificationService } from '../../services/notificationService';
import { advancedSearchService } from '../../services/advancedSearchService';
import { logger } from '../../services/loggingService';

interface UsePhaseTwoServicesArgs {
  pubkey?: string;
}

export function usePhaseTwoServices({ pubkey }: UsePhaseTwoServicesArgs): void {
  useEffect(() => {
    if (!pubkey) return;

    const initServices = async () => {
      try {
        await dmService.initialize(pubkey);
        await followServiceV2.initialize(pubkey);
        await notificationService.initialize(pubkey);
        advancedSearchService.initialize(pubkey);
        dmService.setNotificationHandler((notification) => {
          notificationService.createDM({
            fromPubkey: notification.senderPubkey,
            messageId: notification.messageId,
            preview: notification.preview,
          });
        });
        logger.info('App', `Initialized Phase 2 services for ${pubkey.slice(0, 8)}...`);
      } catch (err) {
        logger.warn('App', 'Failed to initialize some Phase 2 services', err);
      }
    };

    void initServices();

    return () => {
      dmService.setNotificationHandler(() => undefined);
      dmService.cleanup();
      followServiceV2.cleanup();
      notificationService.cleanup();
      advancedSearchService.cleanup();
    };
  }, [pubkey]);
}
