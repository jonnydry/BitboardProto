import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../features/layout/AppContext';
import { ViewMode } from '../types';

export const TermsOfService: React.FC = () => {
  const app = useApp();
  
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 animate-fade-in">
      <button
        onClick={() => app.setViewMode(ViewMode.FEED)}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-xs md:text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>
      
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      
      <p className="text-sm text-gray-500">Last Updated: {new Date().toLocaleDateString()}</p>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Acceptance of Terms</h2>
        <p>
          By accessing and using BitBoard, you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Description of Service</h2>
        <p>
          BitBoard is a decentralized message board application built on the Nostr protocol. It is provided as open-source software and operates as a client-side only application with no backend servers.
        </p>
        <p>
          The service allows you to:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Create and browse topic-based and location-based boards</li>
          <li>Post messages, comments, and votes to the Nostr network</li>
          <li>Create encrypted boards with end-to-end encryption</li>
          <li>Connect to Nostr relay servers of your choice</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">User Responsibilities</h2>
        
        <h3 className="text-xl font-semibold mt-4">Account Security</h3>
        <p>
          You are solely responsible for:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Maintaining the security of your Nostr private keys</li>
          <li>All activity that occurs under your keys</li>
          <li>Backing up your keys (we cannot recover lost keys)</li>
          <li>Not sharing your private keys with anyone</li>
        </ul>

        <h3 className="text-xl font-semibold mt-4">Content Guidelines</h3>
        <p>
          When using BitBoard, you agree to:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Not post illegal content</li>
          <li>Not post content that violates others' intellectual property rights</li>
          <li>Not engage in harassment, hate speech, or threats</li>
          <li>Not post spam or malicious content</li>
          <li>Not impersonate others</li>
          <li>Comply with applicable laws and regulations</li>
        </ul>
        <p className="text-sm text-gray-600 mt-2">
          Note: Content moderation on Nostr is handled by individual relay servers and clients. We provide reporting tools, but cannot guarantee content removal from the decentralized network.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Intellectual Property</h2>
        <p>
          BitBoard is open-source software. The source code is available under the terms of its license (see GitHub repository).
        </p>
        <p>
          Content you post to the Nostr network:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Remains your property</li>
          <li>Is published under the terms of the Nostr protocol</li>
          <li>May be stored and distributed by relay servers</li>
          <li>Is designed to be permanent and publicly accessible (unless encrypted)</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Disclaimers and Limitations</h2>
        
        <h3 className="text-xl font-semibold mt-4">No Warranty</h3>
        <p>
          BitBoard is provided "AS IS" without warranties of any kind, either express or implied, including but not limited to:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Fitness for a particular purpose</li>
          <li>Merchantability</li>
          <li>Non-infringement</li>
          <li>Uninterrupted or error-free operation</li>
        </ul>

        <h3 className="text-xl font-semibold mt-4">Limitation of Liability</h3>
        <p>
          To the maximum extent permitted by law, we shall not be liable for:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Loss of data, keys, or content</li>
          <li>Indirect, incidental, or consequential damages</li>
          <li>Content posted by users</li>
          <li>Actions of third-party relay servers</li>
          <li>Security breaches or unauthorized access</li>
          <li>Service interruptions or downtime</li>
        </ul>

        <h3 className="text-xl font-semibold mt-4">Decentralized Nature</h3>
        <p>
          BitBoard interfaces with the decentralized Nostr protocol. We do not control:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Third-party relay servers</li>
          <li>Content stored on relay servers</li>
          <li>The Nostr protocol itself</li>
          <li>Other Nostr clients and their behavior</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Third-Party Services</h2>
        <p>
          BitBoard may integrate with third-party services (Nostr relays, AI services, error tracking). Your use of these services is subject to their respective terms and privacy policies.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Termination</h2>
        <p>
          You may stop using BitBoard at any time by:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Clearing your browser's local storage</li>
          <li>Deleting your Nostr keys</li>
          <li>Simply not accessing the application</li>
        </ul>
        <p className="text-sm text-gray-600 mt-2">
          Note: Content already published to the Nostr network may remain on relay servers, as this is inherent to the decentralized protocol.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless BitBoard and its contributors from any claims, damages, or expenses arising from:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Your use of the application</li>
          <li>Your violation of these terms</li>
          <li>Your violation of any rights of another party</li>
          <li>Content you post to the Nostr network</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Governing Law</h2>
        <p>
          These terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law provisions.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Changes to Terms</h2>
        <p>
          We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Your continued use of BitBoard after changes constitutes acceptance of the modified terms.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Severability</h2>
        <p>
          If any provision of these terms is found to be unenforceable, the remaining provisions will remain in full force and effect.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Contact</h2>
        <p>
          For questions about these Terms of Service, you can reach out through the Nostr network or open an issue on our GitHub repository.
        </p>
      </section>

      <div className="mt-8 pt-6 border-t border-gray-300">
        <p className="text-sm text-gray-600">
          By using BitBoard, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
        </p>
      </div>
    </div>
  );
};
