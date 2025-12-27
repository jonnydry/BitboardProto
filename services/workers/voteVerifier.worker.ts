// ============================================
// VOTE VERIFICATION WEB WORKER
// ============================================
// Offloads cryptographic signature verification from the main thread
// to improve UI responsiveness during initial load and vote processing
//
// This worker receives batches of vote events and verifies their
// cryptographic signatures using nostr-tools verifyEvent()
//
// Input: { id: string, events: NostrEvent[] }
// Output: { id: string, results: Array<{ id: string, pubkey: string, valid: boolean }> }
//
// ============================================

import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';

// Message handler
self.onmessage = (e: MessageEvent<{ id: string; events: NostrEvent[] }>) => {
  const { id, events } = e.data;

  try {
    // Verify each event and collect results
    const results = events.map((event) => ({
      id: event.id,
      pubkey: event.pubkey,
      valid: verifyEvent(event),
    }));

    // Send results back to main thread
    self.postMessage({ id, results });
  } catch (error) {
    // Send error back to main thread
    self.postMessage({ 
      id, 
      error: error instanceof Error ? error.message : 'Unknown error during verification' 
    });
  }
};

// Signal that the worker is ready
self.postMessage({ type: 'ready' });
