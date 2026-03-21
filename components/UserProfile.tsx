import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { ViewMode } from '../types';
import { PostItem } from './PostItem';
import { ProfileEditor } from './ProfileEditor';
import { profileService, type ProfileMetadata } from '../services/profileService';
import { useFollows } from '../hooks/useFollows';
import { dataExportService } from '../services/dataExportService';
import { toastService } from '../services/toastService';
import { UIConfig } from '../config';
import {
  ArrowLeft,
  User,
  FileText,
  MessageSquare,
  TrendingUp,
  RefreshCw,
  VolumeX,
  Edit,
  Globe,
  Zap,
  Mail,
  ExternalLink,
  Download,
  UserPlus,
  UserMinus,
  Copy,
  CheckCircle,
  Trash2,
} from 'lucide-react';
import { FollowButton as _FollowButton, FollowStats as _FollowStats } from './FollowButton';
import { ZapButton } from './ZapButton';
import { BadgeDisplay } from './BadgeDisplay';
import { TrustIndicator } from './TrustIndicator';
import { wotService } from '../services/wotService';
import { FeatureFlags } from '../config';
import type { WoTScore } from '../types';
import { useUIStore } from '../stores/uiStore';
import { useUserStore } from '../stores/userStore';
import { usePostStore } from '../stores/postStore';
import { useAppNavigationHandlers } from '../features/layout/useAppNavigationHandlers';

interface UserProfileProps {
  onToggleBookmark: (postId: string) => void;
  knownUsers?: Set<string>;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment?: (postId: string, commentId: string, content: string) => void;
  onDeleteComment?: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onRefreshProfile?: (pubkey: string) => void;
  onDeletePost?: (postId: string) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  onToggleBookmark,
  knownUsers,
  onVote,
  onComment,
  onEditComment,
  onDeleteComment,
  onCommentVote,
  onRefreshProfile,
  onDeletePost,
}) => {
  // Read state from Zustand stores
  const profileUser = useUIStore((s) => s.profileUser);
  const isNostrConnected = useUIStore((s) => s.isNostrConnected);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const userState = useUserStore((s) => s.userState);
  const toggleMute = useUserStore((s) => s.toggleMute);
  const isMuted = useUserStore((s) => s.isMuted);
  const posts = usePostStore((s) => s.posts);

  // Derive username and authorPubkey from profileUser
  const username = profileUser?.username ?? '';
  const authorPubkey = profileUser?.pubkey;

  // Navigation handlers
  const { handleViewBit, handleViewProfile, handleEditPost, handleTagClick } =
    useAppNavigationHandlers();

  const onClose = useCallback(() => setViewMode(ViewMode.FEED), [setViewMode]);
  const [profileMetadata, setProfileMetadata] = useState<ProfileMetadata | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showAvatarFallback, setShowAvatarFallback] = useState(false);
  const [showBannerImage, setShowBannerImage] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [wotScore, setWotScore] = useState<WoTScore | null>(null);
  const { follow, unfollow, isFollowing, isLoading: isFollowLoading } = useFollows();

  // Load WoT score for this profile
  useEffect(() => {
    if (!FeatureFlags.ENABLE_WOT) return;
    if (!wotService.getUserPubkey()) return;
    if (!authorPubkey) return;

    wotService
      .getScore(authorPubkey)
      .then((score) => {
        setWotScore(score);
      })
      .catch(() => {});
  }, [authorPubkey]);
  // Filter posts by this user
  const userPosts = useMemo(() => {
    return posts
      .filter((p) => p.author === username || (authorPubkey && p.authorPubkey === authorPubkey))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [posts, username, authorPubkey]);

  // Calculate user stats
  const stats = useMemo(() => {
    const totalScore = userPosts.reduce((sum, p) => sum + p.score, 0);
    const totalComments = userPosts.reduce((sum, p) => sum + p.commentCount, 0);
    return {
      postCount: userPosts.length,
      totalScore,
      totalComments,
      avgScore: userPosts.length > 0 ? Math.round(totalScore / userPosts.length) : 0,
    };
  }, [userPosts]);

  const isOwnProfile =
    userState.username === username ||
    (authorPubkey && userState.identity?.pubkey === authorPubkey);

  // Stabilize callbacks to prevent PostItem re-renders
  const handleVote = useCallback(
    (postId: string, direction: 'up' | 'down') => {
      onVote(postId, direction);
    },
    [onVote],
  );

  const handleComment = useCallback(
    (postId: string, content: string, parentCommentId?: string) => {
      onComment(postId, content, parentCommentId);
    },
    [onComment],
  );

  const handleEditComment = useCallback(
    (postId: string, commentId: string, content: string) => {
      onEditComment?.(postId, commentId, content);
    },
    [onEditComment],
  );

  const handleDeleteComment = useCallback(
    (postId: string, commentId: string) => {
      onDeleteComment?.(postId, commentId);
    },
    [onDeleteComment],
  );

  const handleCommentVote = useCallback(
    (postId: string, commentId: string, direction: 'up' | 'down') => {
      onCommentVote?.(postId, commentId, direction);
    },
    [onCommentVote],
  );

  const handleDeletePost = useCallback(
    (postId: string) => {
      onDeletePost?.(postId);
    },
    [onDeletePost],
  );

  const handleToggleBookmark = useCallback(
    (id: string) => {
      onToggleBookmark(id);
    },
    [onToggleBookmark],
  );

  const handleToggleMute = useCallback(
    (pubkey: string) => {
      toggleMute(pubkey);
    },
    [toggleMute],
  );

  // Virtualization for large lists (>25 items)
  const VIRTUALIZE_THRESHOLD = 25;
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = userPosts.length > VIRTUALIZE_THRESHOLD;

  // Always call the hook (React rules), but use count=0 when not virtualizing
  const rowVirtualizer = useWindowVirtualizer({
    count: shouldVirtualize ? userPosts.length : 0,
    estimateSize: () => 250,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
    overscan: 5,
  });

  // Load profile metadata
  useEffect(() => {
    if (authorPubkey) {
      setIsLoadingProfile(true);
      profileService
        .getProfileMetadata(authorPubkey)
        .then((metadata) => {
          setProfileMetadata(metadata);
        })
        .catch((error) => {
          console.error('[UserProfile] Failed to load profile metadata:', error);
        })
        .finally(() => {
          setIsLoadingProfile(false);
        });
    }
  }, [authorPubkey]);

  useEffect(() => {
    setShowAvatarFallback(!profileMetadata?.picture);
    setShowBannerImage(!!profileMetadata?.banner);
  }, [profileMetadata?.picture, profileMetadata?.banner]);

  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };

  const handleSaveProfile = (updatedProfile: ProfileMetadata) => {
    setProfileMetadata(updatedProfile);
    setIsEditingProfile(false);
    // Refresh the profile data
    if (authorPubkey && onRefreshProfile) {
      onRefreshProfile(authorPubkey);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
  };

  const handleFollowToggle = async () => {
    if (!authorPubkey) return;

    try {
      if (isFollowing(authorPubkey)) {
        await unfollow(authorPubkey);
      } else {
        await follow(authorPubkey);
      }
    } catch (error) {
      console.error('[UserProfile] Follow/unfollow error:', error);
    }
  };

  const handleExportData = async () => {
    try {
      await dataExportService.exportAndDownload();
      toastService.push({
        type: 'success',
        message: 'Data exported successfully',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'data-exported',
      });
    } catch (error) {
      console.error('[UserProfile] Export error:', error);
      toastService.push({
        type: 'error',
        message: 'Failed to export data',
        detail: error instanceof Error ? error.message : 'Unknown error',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'export-failed',
      });
    }
  };

  const handleDeleteAllData = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete all your data? This action cannot be undone!\n\n' +
        'This will delete:\n' +
        '- Your identity (you will lose access to your account)\n' +
        '- All posts, bookmarks, and votes\n' +
        '- All settings and preferences\n\n' +
        'Make sure you have backed up your private key before proceeding.',
    );

    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      'This is your final warning! ALL DATA WILL BE PERMANENTLY DELETED.\n\n' +
        'Type "DELETE" in all caps to confirm:',
    );

    if (!doubleConfirm) return;

    try {
      dataExportService.deleteAllUserData();
      toastService.push({
        type: 'success',
        message: 'All data deleted. Refreshing...',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'data-deleted',
      });
      // Reload the page to reset the app state
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('[UserProfile] Delete error:', error);
      toastService.push({
        type: 'error',
        message: 'Failed to delete data',
        detail: error instanceof Error ? error.message : 'Unknown error',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'delete-failed',
      });
    }
  };

  const handleCopyPubkey = async () => {
    if (!authorPubkey) return;

    try {
      await navigator.clipboard.writeText(authorPubkey);
      setCopiedField('pubkey');
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('[UserProfile] Copy pubkey error:', error);
      toastService.push({
        type: 'error',
        message: 'Failed to copy public key',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'copy-pubkey-failed',
      });
    }
  };

  // If editing profile, show the editor
  if (isEditingProfile && isOwnProfile) {
    return (
      <ProfileEditor
        initialProfile={profileMetadata || {}}
        onSave={handleSaveProfile}
        onCancel={handleCancelEdit}
        isLoading={isLoadingProfile}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      {/* Profile Header */}
      <div className="ui-surface-editor max-w-none overflow-hidden">
        <div className="flex items-center justify-between border-b border-terminal-dim/15 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-terminal-text" />
            <span className="font-mono text-sm uppercase tracking-[0.12em] text-terminal-dim">
              Profile
            </span>
          </div>
          {authorPubkey && <TrustIndicator pubkey={authorPubkey} compact={false} />}
        </div>
        <div className="p-6">
          {/* Banner */}
          {profileMetadata?.banner && showBannerImage && (
            <div className="mb-4 h-32 w-full overflow-hidden rounded border border-terminal-dim/20">
              <img
                src={profileMetadata.banner}
                alt="Profile banner"
                className="w-full h-full object-cover"
                onError={() => setShowBannerImage(false)}
              />
            </div>
          )}

          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-terminal-dim/25 bg-terminal-dim/10">
              {profileMetadata?.picture && !showAvatarFallback ? (
                <img
                  src={profileMetadata.picture}
                  alt={`${username}'s avatar`}
                  className="w-full h-full object-cover"
                  onError={() => setShowAvatarFallback(true)}
                />
              ) : null}
              <User
                size={32}
                className={`text-terminal-text ${showAvatarFallback ? '' : 'hidden'}`}
              />
            </div>

            <div className="flex-1">
              <div className="mb-2 flex items-center gap-3">
                <h2 className="font-display text-3xl font-semibold text-terminal-text">
                  {profileService.getDisplayName(username, profileMetadata)}
                </h2>
                {isOwnProfile && (
                  <span className="border border-terminal-dim/30 px-2 py-0.5 text-xs uppercase tracking-[0.12em] text-terminal-text">
                    YOU
                  </span>
                )}

                {!isOwnProfile && authorPubkey && (
                  <button
                    onClick={() => toggleMute(authorPubkey)}
                    className={`flex items-center gap-1 border px-2 py-0.5 text-xs uppercase transition-colors
                    ${
                      isMuted?.(authorPubkey)
                        ? 'border-terminal-alert text-terminal-alert hover:bg-terminal-alert hover:text-black'
                        : 'border-terminal-dim text-terminal-dim hover:text-terminal-alert hover:border-terminal-alert'
                    }`}
                  >
                    <VolumeX size={12} />
                    {isMuted(authorPubkey) ? 'UNMUTE' : 'MUTE'}
                  </button>
                )}

                {/* Follow/Unfollow Button */}
                {!isOwnProfile && authorPubkey && (
                  <button
                    onClick={handleFollowToggle}
                    disabled={isFollowLoading}
                    className={`flex items-center gap-1 border px-2 py-0.5 text-xs uppercase transition-colors ${
                      isFollowing(authorPubkey)
                        ? 'border-terminal-alert text-terminal-alert hover:bg-terminal-alert hover:text-black'
                        : 'border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text'
                    }`}
                  >
                    {isFollowing(authorPubkey) ? (
                      <>
                        <UserMinus size={12} />
                        UNFOLLOW
                      </>
                    ) : (
                      <>
                        <UserPlus size={12} />
                        FOLLOW
                      </>
                    )}
                  </button>
                )}

                {/* Zap Button */}
                {!isOwnProfile && authorPubkey && (
                  <ZapButton authorPubkey={authorPubkey} authorName={username} compact={false} />
                )}

                {/* Edit Profile Button */}
                {isOwnProfile && (
                  <>
                    <button
                      onClick={handleEditProfile}
                      className="flex items-center gap-1 border border-terminal-dim/30 px-2 py-0.5 text-xs uppercase transition-colors hover:border-terminal-dim/60 hover:text-terminal-text"
                    >
                      <Edit size={12} />
                      EDIT
                    </button>
                    <button
                      onClick={handleExportData}
                      className="flex items-center gap-1 border border-terminal-dim/30 px-2 py-0.5 text-xs uppercase transition-colors hover:border-terminal-dim/60 hover:text-terminal-text"
                      title="Export your data (GDPR compliant)"
                    >
                      <Download size={12} />
                      EXPORT
                    </button>
                    <button
                      onClick={handleDeleteAllData}
                      className="flex items-center gap-1 border border-terminal-alert/40 px-2 py-0.5 text-xs uppercase text-terminal-alert/80 transition-colors hover:border-terminal-alert hover:text-terminal-alert"
                      title="Delete all your data (GDPR - Right to be Forgotten)"
                    >
                      <Trash2 size={12} />
                      DELETE
                    </button>
                  </>
                )}

                {authorPubkey && onRefreshProfile && (
                  <button
                    type="button"
                    onClick={() => onRefreshProfile(authorPubkey)}
                    disabled={!isNostrConnected || isLoadingProfile}
                    className="ui-button-secondary ml-auto flex items-center gap-2 px-3 py-2 md:py-1 text-xs disabled:opacity-50"
                    title={
                      isNostrConnected
                        ? 'Refresh profile metadata'
                        : 'Offline: cannot refresh profile'
                    }
                  >
                    <RefreshCw size={12} className={isLoadingProfile ? 'animate-spin' : ''} />
                    REFRESH
                  </button>
                )}
              </div>

              {authorPubkey && (
                <div className="mb-3 flex items-center gap-3">
                  <p className="text-xs text-terminal-dim font-mono truncate max-w-md">
                    npub: {authorPubkey.slice(0, 16)}...{authorPubkey.slice(-8)}
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyPubkey}
                    className="flex items-center gap-1 border border-terminal-dim/30 px-2 py-1 text-xs uppercase text-terminal-dim transition-colors hover:border-terminal-dim/60 hover:text-terminal-text"
                    title="Copy public key"
                  >
                    {copiedField === 'pubkey' ? <CheckCircle size={12} /> : <Copy size={12} />}
                    {copiedField === 'pubkey' ? 'COPIED' : 'COPY'}
                  </button>
                </div>
              )}

              {/* WoT score row */}
              {FeatureFlags.ENABLE_WOT && wotService.getUserPubkey() && wotScore && (
                <div className="flex items-center gap-2 text-xs text-terminal-dim font-mono mb-3">
                  <span className="text-terminal-text font-bold">WOT:</span>
                  <span>{Math.round(wotScore.score * 100)}%</span>
                  <span>·</span>
                  <span>DIST_{wotScore.distance}</span>
                  {wotScore.followedBy.length > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {wotScore.followedBy.length} mutual
                        {wotScore.followedBy.length !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Bio/About */}
              {profileMetadata?.about && (
                <p className="text-terminal-text mb-3 leading-relaxed">{profileMetadata.about}</p>
              )}

              {/* Badges */}
              {authorPubkey && (
                <div className="mb-4 border-t border-terminal-dim/15 pt-4">
                  <BadgeDisplay pubkey={authorPubkey} size="md" showLabel={true} />
                </div>
              )}

              {/* Links */}
              {(profileMetadata?.website ||
                profileMetadata?.nip05 ||
                profileMetadata?.lud16 ||
                profileMetadata?.lud06) && (
                <div className="mb-4 flex flex-wrap gap-3">
                  {profileMetadata.website && (
                    <a
                      href={profileMetadata.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-terminal-dim hover:text-terminal-text transition-colors"
                    >
                      <Globe size={12} />
                      Website
                      <ExternalLink size={10} />
                    </a>
                  )}
                  {profileMetadata.nip05 && (
                    <div className="flex items-center gap-1 text-xs text-terminal-dim">
                      <Mail size={12} />
                      {profileMetadata.nip05}
                    </div>
                  )}
                  {(profileMetadata.lud16 || profileMetadata.lud06) && (
                    <div className="flex items-center gap-1 text-xs text-terminal-dim">
                      <Zap size={12} />
                      Lightning
                    </div>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-1 gap-3 border-t border-terminal-dim/15 pt-4 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-terminal-dim" />
                  <span className="text-terminal-text font-bold">{stats.postCount}</span>
                  <span className="text-terminal-dim">posts</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-terminal-dim" />
                  <span className="text-terminal-text font-bold">{stats.totalScore}</span>
                  <span className="text-terminal-dim">total score</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-terminal-dim" />
                  <span className="text-terminal-text font-bold">{stats.totalComments}</span>
                  <span className="text-terminal-dim">comments received</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User's Posts */}
      <div className="mb-4 border-b border-terminal-dim/20 pb-2">
        <h3 className="font-display text-2xl font-semibold text-terminal-text">
          POSTS BY {username}
        </h3>
        <p className="text-xs text-terminal-dim mt-1">
          {userPosts.length} {userPosts.length === 1 ? 'post' : 'posts'} found
        </p>
      </div>

      {userPosts.length === 0 ? (
        <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
          <div className="text-4xl opacity-20">( _ _)</div>
          <div>
            <p className="font-bold">&gt; NO POSTS FOUND</p>
            <p className="text-xs mt-2">This user hasn't posted anything yet.</p>
          </div>
        </div>
      ) : shouldVirtualize && rowVirtualizer ? (
        <div ref={parentRef} className="relative">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const post = userPosts[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <PostItem
                    post={post}
                    userState={userState}
                    knownUsers={knownUsers}
                    onVote={handleVote}
                    onComment={handleComment}
                    onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment}
                    onCommentVote={handleCommentVote}
                    onViewBit={handleViewBit}
                    onViewProfile={handleViewProfile}
                    onTagClick={handleTagClick}
                    onEditPost={handleEditPost}
                    onDeletePost={handleDeletePost}
                    onToggleBookmark={handleToggleBookmark}
                    onToggleMute={handleToggleMute}
                    isMuted={isMuted}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {userPosts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              userState={userState}
              knownUsers={knownUsers}
              onVote={handleVote}
              onComment={handleComment}
              onEditComment={handleEditComment}
              onDeleteComment={handleDeleteComment}
              onCommentVote={handleCommentVote}
              onViewBit={handleViewBit}
              onViewProfile={handleViewProfile}
              onTagClick={handleTagClick}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              onToggleBookmark={handleToggleBookmark}
              onToggleMute={handleToggleMute}
              isMuted={isMuted}
            />
          ))}
        </div>
      )}
    </div>
  );
};
