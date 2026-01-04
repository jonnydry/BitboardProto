import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Post, UserState, ViewMode } from '../types';
import { PostItem } from './PostItem';
import { ProfileEditor } from './ProfileEditor';
import { profileService, type ProfileMetadata } from '../services/profileService';
import { useFollows } from '../hooks/useFollows';
import { dataExportService } from '../services/dataExportService';
import { toastService } from '../services/toastService';
import { UIConfig } from '../config';
import { ArrowLeft, User, FileText, MessageSquare, TrendingUp, RefreshCw, VolumeX, Edit, Globe, Zap, Mail, ExternalLink, Download, UserPlus, UserMinus } from 'lucide-react';
import { FollowButton as _FollowButton, FollowStats as _FollowStats } from './FollowButton';

interface UserProfileProps {
  username: string;
  authorPubkey?: string;
  posts: Post[];
  bookmarkedIdSet: Set<string>;
  reportedPostIdSet: Set<string>;
  onToggleBookmark: (postId: string) => void;
  userState: UserState;
  knownUsers?: Set<string>;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment?: (postId: string, commentId: string, content: string) => void;
  onDeleteComment?: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onViewBit: (postId: string) => void;
  onViewProfile?: (username: string, pubkey?: string) => void;
  onEditPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onTagClick?: (tag: string) => void;
  onRefreshProfile?: (pubkey: string) => void;
  onClose: () => void;
  isNostrConnected: boolean;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
  onSetViewMode?: (mode: ViewMode) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  username,
  authorPubkey,
  posts,
  bookmarkedIdSet,
  reportedPostIdSet,
  onToggleBookmark,
  userState,
  knownUsers,
  onVote,
  onComment,
  onEditComment,
  onDeleteComment,
  onCommentVote,
  onViewBit,
  onViewProfile,
  onEditPost,
  onDeletePost,
  onTagClick,
  onRefreshProfile,
  onClose,
  isNostrConnected,
  onToggleMute,
  isMuted,
  onSetViewMode,
}) => {
  const [profileMetadata, setProfileMetadata] = useState<ProfileMetadata | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const { follow, unfollow, isFollowing, isLoading: isFollowLoading } = useFollows();
  // Filter posts by this user
  const userPosts = useMemo(() => {
    return posts.filter(p => 
      p.author === username || 
      (authorPubkey && p.authorPubkey === authorPubkey)
    ).sort((a, b) => b.timestamp - a.timestamp);
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

  const isOwnProfile = userState.username === username ||
    (authorPubkey && userState.identity?.pubkey === authorPubkey);

  // Stabilize callbacks to prevent PostItem re-renders
  const handleVote = useCallback((postId: string, direction: 'up' | 'down') => {
    onVote(postId, direction);
  }, [onVote]);

  const handleComment = useCallback((postId: string, content: string, parentCommentId?: string) => {
    onComment(postId, content, parentCommentId);
  }, [onComment]);

  const handleEditComment = useCallback((postId: string, commentId: string, content: string) => {
    onEditComment?.(postId, commentId, content);
  }, [onEditComment]);

  const handleDeleteComment = useCallback((postId: string, commentId: string) => {
    onDeleteComment?.(postId, commentId);
  }, [onDeleteComment]);

  const handleCommentVote = useCallback((postId: string, commentId: string, direction: 'up' | 'down') => {
    onCommentVote?.(postId, commentId, direction);
  }, [onCommentVote]);

  const handleViewBit = useCallback((postId: string) => {
    onViewBit(postId);
  }, [onViewBit]);

  const handleViewProfile = useCallback((username: string, pubkey?: string) => {
    onViewProfile?.(username, pubkey);
  }, [onViewProfile]);

  const handleEditPost = useCallback((postId: string) => {
    onEditPost?.(postId);
  }, [onEditPost]);

  const handleDeletePost = useCallback((postId: string) => {
    onDeletePost?.(postId);
  }, [onDeletePost]);

  const handleTagClick = useCallback((tag: string) => {
    onTagClick?.(tag);
  }, [onTagClick]);

  const handleToggleBookmark = useCallback((id: string) => {
    onToggleBookmark(id);
  }, [onToggleBookmark]);

  const handleToggleMute = useCallback((pubkey: string) => {
    onToggleMute?.(pubkey);
  }, [onToggleMute]);

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
      profileService.getProfileMetadata(authorPubkey)
        .then(metadata => {
          setProfileMetadata(metadata);
        })
        .catch(error => {
          console.error('[UserProfile] Failed to load profile metadata:', error);
        })
        .finally(() => {
          setIsLoadingProfile(false);
        });
    }
  }, [authorPubkey]);

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
      <div className="border-2 border-terminal-text bg-terminal-bg p-6 mb-6 shadow-hard">
        {/* Banner */}
        {profileMetadata?.banner && (
          <div className="w-full h-32 mb-4 overflow-hidden rounded border border-terminal-dim">
            <img
              src={profileMetadata.banner}
              alt="Profile banner"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 border-2 border-terminal-text flex items-center justify-center bg-terminal-dim/20 overflow-hidden rounded">
            {profileMetadata?.picture ? (
              <img
                src={profileMetadata.picture}
                alt={`${username}'s avatar`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <User size={32} className={`text-terminal-text ${profileMetadata?.picture ? 'hidden' : ''}`} />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-terminal-text">
                {profileService.getDisplayName(username, profileMetadata)}
              </h2>
              {isOwnProfile && (
                <span className="text-xs border border-terminal-text px-2 py-0.5 text-terminal-text">
                  YOU
                </span>
              )}

              {!isOwnProfile && authorPubkey && onToggleMute && (
                <button
                  onClick={() => onToggleMute(authorPubkey)}
                  className={`flex items-center gap-1 text-xs border px-2 py-0.5 transition-colors uppercase
                    ${isMuted?.(authorPubkey)
                      ? 'border-terminal-alert text-terminal-alert hover:bg-terminal-alert hover:text-black'
                      : 'border-terminal-dim text-terminal-dim hover:text-terminal-alert hover:border-terminal-alert'
                    }`}
                >
                  <VolumeX size={12} />
                  {isMuted?.(authorPubkey) ? 'UNMUTE' : 'MUTE'}
                </button>
              )}

              {/* Follow/Unfollow Button */}
              {!isOwnProfile && authorPubkey && (
                <button
                  onClick={handleFollowToggle}
                  disabled={isFollowLoading}
                  className={`flex items-center gap-1 text-xs border px-2 py-0.5 transition-colors uppercase ${
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

              {/* Edit Profile Button */}
              {isOwnProfile && onSetViewMode && (
                <>
                  <button
                    onClick={handleEditProfile}
                    className="flex items-center gap-1 text-xs border border-terminal-dim px-2 py-0.5 hover:border-terminal-text hover:text-terminal-text transition-colors uppercase"
                  >
                    <Edit size={12} />
                    EDIT
                  </button>
                  <button
                    onClick={handleExportData}
                    className="flex items-center gap-1 text-xs border border-terminal-dim px-2 py-0.5 hover:border-terminal-text hover:text-terminal-text transition-colors uppercase"
                    title="Export your data (GDPR compliant)"
                  >
                    <Download size={12} />
                    EXPORT
                  </button>
                </>
              )}

              {authorPubkey && onRefreshProfile && (
                <button
                  type="button"
                  onClick={() => onRefreshProfile(authorPubkey)}
                  disabled={!isNostrConnected || isLoadingProfile}
                  className="ml-auto flex items-center gap-2 px-3 py-2 md:py-1 border border-terminal-dim text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors uppercase text-xs disabled:opacity-50"
                  title={isNostrConnected ? 'Refresh profile metadata' : 'Offline: cannot refresh profile'}
                >
                  <RefreshCw size={12} className={isLoadingProfile ? 'animate-spin' : ''} />
                  REFRESH
                </button>
              )}
            </div>

            {authorPubkey && (
              <p className="text-xs text-terminal-dim font-mono mb-3 truncate max-w-md">
                npub: {authorPubkey.slice(0, 16)}...{authorPubkey.slice(-8)}
              </p>
            )}

            {/* Bio/About */}
            {profileMetadata?.about && (
              <p className="text-terminal-text mb-3 leading-relaxed">
                {profileMetadata.about}
              </p>
            )}

            {/* Links */}
            {(profileMetadata?.website || profileMetadata?.nip05 || profileMetadata?.lud16 || profileMetadata?.lud06) && (
              <div className="flex flex-wrap gap-3 mb-4">
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
            <div className="flex gap-6 text-sm">
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

      {/* User's Posts */}
      <div className="mb-4 pb-2 border-b border-terminal-dim/30">
        <h3 className="text-lg font-bold text-terminal-text uppercase tracking-wider">
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
                    isBookmarked={bookmarkedIdSet.has(post.id)}
                    onToggleBookmark={handleToggleBookmark}
                    hasReported={reportedPostIdSet.has(post.id)}
                    isNostrConnected={isNostrConnected}
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
          {userPosts.map(post => (
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
              isBookmarked={bookmarkedIdSet.has(post.id)}
              onToggleBookmark={handleToggleBookmark}
              hasReported={reportedPostIdSet.has(post.id)}
              isNostrConnected={isNostrConnected}
              onToggleMute={handleToggleMute}
              isMuted={isMuted}
            />
          ))}
        </div>
      )}
    </div>
  );
};
