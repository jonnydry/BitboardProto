import { useEffect } from 'react';
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
        await followServiceV2.initialize(pubkey);
        await notificationService.initialize(pubkey);
        advancedSearchService.initialize(pubkey);
        logger.info('App', `Initialized Phase 2 services for ${pubkey.slice(0, 8)}...`);
      } catch (err) {
        logger.warn('App', 'Failed to initialize some Phase 2 services', err);
      }
    };

    void initServices();

    return () => {
      followServiceV2.cleanup();
      notificationService.cleanup();
      advancedSearchService.cleanup();
    };
  }, [pubkey]);
}
