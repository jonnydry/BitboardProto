import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../features/layout/AppContext';
import { ViewMode } from '../types';

export const PrivacyPolicy: React.FC = () => {
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
      
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      
      <p className="text-sm text-gray-500">Last Updated: {new Date().toLocaleDateString()}</p>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p>
          BitBoard is a decentralized message board built on the Nostr protocol. We are committed to protecting your privacy and being transparent about how the application works.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">What We Collect</h2>
        <p>
          BitBoard is a <strong>client-side only application</strong> that runs entirely in your browser. We do not operate any backend servers that collect or store your data.
        </p>
        
        <h3 className="text-xl font-semibold mt-4">Local Storage</h3>
        <p>
          The following data is stored locally in your browser's storage:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Nostr Keys:</strong> Your private and public keys for the Nostr protocol</li>
          <li><strong>User Preferences:</strong> Theme selection, relay settings, bookmarks</li>
          <li><strong>Cached Content:</strong> Posts, boards, and comments for faster loading</li>
          <li><strong>Draft Content:</strong> Unsent posts and comments</li>
        </ul>
        <p className="text-sm text-gray-600 mt-2">
          This data never leaves your device unless you explicitly publish content to the Nostr network.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">How Data is Shared</h2>
        
        <h3 className="text-xl font-semibold mt-4">Nostr Network</h3>
        <p>
          When you create posts, comments, or votes, this content is published to the Nostr network through relay servers you configure. This is inherent to how the Nostr protocol works:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Public posts are visible to anyone on the Nostr network</li>
          <li>Your public key is associated with your content</li>
          <li>Relay servers may store your published content</li>
          <li>Content on Nostr is designed to be permanent and distributed</li>
        </ul>
        
        <h3 className="text-xl font-semibold mt-4">Encrypted Boards</h3>
        <p>
          Encrypted boards use end-to-end encryption. Only users with the encryption key can read the content. The encrypted data is still published to Nostr relays, but it cannot be read without the key.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Third-Party Services</h2>
        
        <h3 className="text-xl font-semibold mt-4">Optional Services</h3>
        <p>
          BitBoard may use the following optional third-party services:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Google Gemini API:</strong> If configured, used for AI-powered link content scanning (requires API key)</li>
          <li><strong>Sentry:</strong> If configured, used for error tracking and monitoring (requires DSN)</li>
          <li><strong>Nostr Relays:</strong> Third-party servers that relay Nostr protocol messages (you choose which relays to use)</li>
        </ul>
        <p className="text-sm text-gray-600 mt-2">
          These services are only used if you explicitly configure them. Check their respective privacy policies for more information.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Cookies and Tracking</h2>
        <p>
          BitBoard does not use cookies or tracking scripts. We do not track your browsing behavior or collect analytics data.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Data Security</h2>
        <p>
          Your Nostr private keys are stored encrypted in your browser's local storage. However, you are responsible for:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Keeping your private keys secure</li>
          <li>Backing up your keys (we cannot recover lost keys)</li>
          <li>Using secure devices and browsers</li>
          <li>Not sharing your private keys with anyone</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Your Rights</h2>
        <p>
          Since BitBoard is a client-side application with no backend:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Access:</strong> All your data is in your browser's local storage, which you can access directly</li>
          <li><strong>Deletion:</strong> You can clear your browser's local storage at any time to delete all local data</li>
          <li><strong>Portability:</strong> You can export your Nostr keys and use them with other Nostr clients</li>
        </ul>
        <p className="text-sm text-gray-600 mt-2">
          Note: Content published to the Nostr network cannot be deleted from relay servers, as this is a fundamental aspect of the decentralized protocol.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Children's Privacy</h2>
        <p>
          BitBoard is not intended for users under the age of 13. We do not knowingly collect information from children.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Changes to This Policy</h2>
        <p>
          We may update this privacy policy from time to time. The "Last Updated" date at the top of this page will reflect when changes were made.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Contact</h2>
        <p>
          If you have questions about this privacy policy, you can reach out through the Nostr network or open an issue on our GitHub repository.
        </p>
      </section>

      <div className="mt-8 pt-6 border-t border-gray-300">
        <p className="text-sm text-gray-600">
          BitBoard is open source software. You can review the code to verify how your data is handled at our GitHub repository.
        </p>
      </div>
    </div>
  );
};
