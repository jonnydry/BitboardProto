import React, { useState, useEffect } from 'react';
import { UserPlus, UserMinus, Users, Loader } from 'lucide-react';
import { followServiceV2 } from '../services/followServiceV2';

// ============================================
// TYPES
// ============================================

type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonVariant = 'default' | 'compact' | 'icon';

interface FollowButtonProps {
  targetPubkey: string;
  currentUserPubkey: string | null;
  size?: ButtonSize;
  variant?: ButtonVariant;
  onFollowChange?: (isFollowing: boolean) => void;
}

interface FollowStatsProps {
  pubkey: string;
  followingCount?: number;
  followersCount?: number;
  onFollowingClick?: () => void;
  onFollowersClick?: () => void;
}

interface UserListProps {
  users: Array<{
    pubkey: string;
    displayName?: string;
    avatar?: string;
    petname?: string;
  }>;
  currentUserPubkey: string | null;
  title: string;
  emptyMessage: string;
  onUserClick?: (pubkey: string) => void;
  onClose: () => void;
}

// ============================================
// FOLLOW BUTTON
// ============================================

export const FollowButton: React.FC<FollowButtonProps> = ({
  targetPubkey,
  currentUserPubkey,
  size = 'md' as ButtonSize,
  variant = 'default' as ButtonVariant,
  onFollowChange,
}) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutual, setIsMutual] = useState(false);

  // Check follow status on mount and when target changes
  useEffect(() => {
    if (currentUserPubkey) {
      setIsFollowing(followServiceV2.isFollowing(targetPubkey));
      setIsMutual(followServiceV2.isMutual(targetPubkey));
    }
  }, [targetPubkey, currentUserPubkey]);

  // Can't follow yourself
  if (targetPubkey === currentUserPubkey) {
    return null;
  }

  // Must be logged in
  if (!currentUserPubkey) {
    return (
      <button
        disabled
        className={`
          ${getSizeClasses(size)}
          border border-terminal-dim text-terminal-dim cursor-not-allowed opacity-50
        `}
      >
        {variant === 'icon' ? <UserPlus size={getIconSize(size)} /> : '[ LOGIN_TO_FOLLOW ]'}
      </button>
    );
  }

  const handleClick = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      if (isFollowing) {
        const success = await followServiceV2.unfollow(targetPubkey);
        if (success) {
          setIsFollowing(false);
          setIsMutual(false);
          onFollowChange?.(false);
        }
      } else {
        const success = await followServiceV2.follow(targetPubkey);
        if (success) {
          setIsFollowing(true);
          setIsMutual(followServiceV2.isMutual(targetPubkey));
          onFollowChange?.(true);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const buttonContent = () => {
    if (isLoading) {
      return <Loader size={getIconSize(size)} className="animate-spin" />;
    }

    if (variant === 'icon') {
      return isFollowing ? (
        <UserMinus size={getIconSize(size)} />
      ) : (
        <UserPlus size={getIconSize(size)} />
      );
    }

    if (variant === 'compact') {
      return isFollowing ? 'Following' : 'Follow';
    }

    return isFollowing ? '[ UNFOLLOW ]' : '[ FOLLOW ]';
  };

  const buttonClasses = `
    ${getSizeClasses(size)}
    font-bold transition-all duration-200
    ${isFollowing 
      ? 'border border-terminal-text text-terminal-text hover:border-terminal-alert hover:text-terminal-alert hover:bg-terminal-alert/10' 
      : 'bg-terminal-text text-black hover:bg-terminal-dim hover:text-white'
    }
    ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
    flex items-center justify-center gap-2
  `;

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={buttonClasses}
      title={isFollowing ? 'Unfollow this user' : 'Follow this user'}
    >
      {buttonContent()}
      {isMutual && variant !== 'icon' && (
        <span className="text-xs opacity-70">(mutual)</span>
      )}
    </button>
  );
};

// ============================================
// FOLLOW STATS
// ============================================

export const FollowStats: React.FC<FollowStatsProps> = ({
  pubkey,
  followingCount,
  followersCount,
  onFollowingClick,
  onFollowersClick,
}) => {
  const [stats, setStats] = useState({
    following: followingCount ?? 0,
    followers: followersCount ?? 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Fetch stats if not provided
  useEffect(() => {
    if (followingCount === undefined || followersCount === undefined) {
      setIsLoading(true);
      followServiceV2.getStatsForUser(pubkey)
        .then(s => {
          setStats({
            following: followingCount ?? s.followingCount,
            followers: followersCount ?? s.followersCount,
          });
        })
        .finally(() => setIsLoading(false));
    }
  }, [pubkey, followingCount, followersCount]);

  return (
    <div className="flex gap-4 text-sm">
      <button
        onClick={onFollowingClick}
        className="hover:text-terminal-text transition-colors"
        disabled={!onFollowingClick}
      >
        <span className="font-bold text-terminal-text">
          {isLoading ? '...' : stats.following}
        </span>
        <span className="text-terminal-dim ml-1">Following</span>
      </button>
      
      <button
        onClick={onFollowersClick}
        className="hover:text-terminal-text transition-colors"
        disabled={!onFollowersClick}
      >
        <span className="font-bold text-terminal-text">
          {isLoading ? '...' : stats.followers}
        </span>
        <span className="text-terminal-dim ml-1">Followers</span>
      </button>
    </div>
  );
};

// ============================================
// USER LIST (Following/Followers List)
// ============================================

export const UserList: React.FC<UserListProps> = ({
  users,
  currentUserPubkey,
  title,
  emptyMessage,
  onUserClick,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-terminal-bg border-2 border-terminal-text w-full max-w-md max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-terminal-dim flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Users size={20} />
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-terminal-dim hover:text-terminal-alert transition-colors"
          >
            ✕
          </button>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto">
          {users.length === 0 ? (
            <div className="p-8 text-center text-terminal-dim">
              {emptyMessage}
            </div>
          ) : (
            users.map(user => (
              <UserListItem
                key={user.pubkey}
                user={user}
                currentUserPubkey={currentUserPubkey}
                onClick={() => onUserClick?.(user.pubkey)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// USER LIST ITEM
// ============================================

const UserListItem: React.FC<{
  user: {
    pubkey: string;
    displayName?: string;
    avatar?: string;
    petname?: string;
  };
  currentUserPubkey: string | null;
  onClick?: () => void;
}> = ({ user, currentUserPubkey, onClick }) => {
  const displayName = user.displayName || user.petname || `${user.pubkey.slice(0, 8)}...`;

  return (
    <div
      onClick={onClick}
      className="p-3 border-b border-terminal-dim/30 hover:bg-terminal-dim/10 cursor-pointer flex items-center gap-3"
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full border border-terminal-dim flex items-center justify-center bg-terminal-dim/20 flex-shrink-0 overflow-hidden">
        {user.avatar ? (
          <img src={user.avatar} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-terminal-dim text-lg">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-terminal-text truncate">{displayName}</div>
        {user.petname && user.displayName && (
          <div className="text-xs text-terminal-dim">aka {user.petname}</div>
        )}
        <div className="text-xs text-terminal-dim font-mono truncate">
          {user.pubkey.slice(0, 16)}...
        </div>
      </div>

      {/* Follow Button */}
      <FollowButton
        targetPubkey={user.pubkey}
        currentUserPubkey={currentUserPubkey}
        size="sm"
        variant="compact"
      />
    </div>
  );
};

// ============================================
// HELPERS
// ============================================

function getSizeClasses(size: ButtonSize): string {
  switch (size) {
    case 'sm':
      return 'px-2 py-1 text-xs';
    case 'md':
      return 'px-4 py-2 text-sm';
    case 'lg':
      return 'px-6 py-3 text-base';
    default:
      return 'px-4 py-2 text-sm';
  }
}

function getIconSize(size: ButtonSize): number {
  switch (size) {
    case 'sm':
      return 14;
    case 'md':
      return 18;
    case 'lg':
      return 22;
    default:
      return 18;
  }
}

export default FollowButton;
