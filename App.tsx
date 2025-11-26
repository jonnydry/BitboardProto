import React, { useState, useCallback, useEffect } from 'react';
import { MAX_DAILY_BITS, INITIAL_POSTS, INITIAL_BOARDS } from './constants';
import { Post, UserState, ViewMode, Board, ThemeId } from './types';
import { PostItem } from './components/PostItem';
import { BitStatus } from './components/BitStatus';
import { CreatePost } from './components/CreatePost';
import { CreateBoard } from './components/CreateBoard';
import { Terminal, HelpCircle, ArrowLeft, Hash, Lock, Globe, Eye } from 'lucide-react';

export default function App() {
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [boards, setBoards] = useState<Board[]>(INITIAL_BOARDS);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.FEED);
  const [selectedBitId, setSelectedBitId] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null); // null = Global Feed
  const [theme, setTheme] = useState<ThemeId>(ThemeId.AMBER);
  
  const [userState, setUserState] = useState<UserState>({
    username: 'u/guest_' + Math.floor(Math.random() * 10000).toString(16),
    bits: MAX_DAILY_BITS,
    maxBits: MAX_DAILY_BITS,
    votedPosts: {}
  });

  // Apply theme to body
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Filter posts based on view (Global vs Specific Board)
  const filteredPosts = activeBoardId 
    ? posts.filter(p => p.boardId === activeBoardId)
    : posts.filter(p => {
        const board = boards.find(b => b.id === p.boardId);
        return board?.isPublic; // Global feed only shows public boards
      });

  // Sort posts: Global feed = Score desc; Board feed = Time desc (usually) or Score
  // For now, let's keep everything score desc for "best bits" surfacing
  const sortedPosts = [...filteredPosts].sort((a, b) => b.score - a.score);

  // Find selected post for single view
  const selectedPost = selectedBitId ? posts.find(p => p.id === selectedBitId) : null;
  
  // Find active board object
  const activeBoard = activeBoardId ? boards.find(b => b.id === activeBoardId) : null;

  const handleVote = useCallback((postId: string, direction: 'up' | 'down') => {
    setUserState(prev => {
      const currentVote = prev.votedPosts[postId];
      let newBits = prev.bits;
      let newVotedPosts = { ...prev.votedPosts };
      let scoreDelta = 0;

      // CORE RULE: 1 BIT PER POST LIMIT
      // Users can only have one active 'up' or 'down' state per post.
      
      if (currentVote === direction) {
        // Case 1: Undo Vote (Refund)
        // User clicks the same direction again.
        // Action: Refund 1 bit, remove vote record.
        newBits += 1;
        delete newVotedPosts[postId];
        scoreDelta = direction === 'up' ? -1 : 1;
      
      } else if (currentVote) {
        // Case 2: Switch Vote
        // User switches from Up to Down (or vice versa).
        // Action: No bit cost change (Refund 1, Spend 1). Score swings by 2.
        scoreDelta = direction === 'up' ? 2 : -2;
        newVotedPosts[postId] = direction;
      
      } else {
        // Case 3: New Vote (Spend)
        // User has not voted on this post yet.
        // Action: Spend 1 bit.
        if (prev.bits <= 0) return prev; // Enforce scarcity
        
        newBits -= 1;
        newVotedPosts[postId] = direction;
        scoreDelta = direction === 'up' ? 1 : -1;
      }

      // Update post score safely based on the calculated delta
      setPosts(currentPosts => 
        currentPosts.map(p => 
          p.id === postId ? { ...p, score: p.score + scoreDelta } : p
        )
      );

      return {
        ...prev,
        bits: newBits,
        votedPosts: newVotedPosts
      };
    });
  }, []);

  const handleCreatePost = (newPostData: Omit<Post, 'id' | 'timestamp' | 'score' | 'commentCount' | 'comments'>) => {
    const newPost: Post = {
      ...newPostData,
      id: `local-${Date.now()}`,
      timestamp: Date.now(),
      score: 1, // Self upvote implicit usually
      commentCount: 0,
      comments: []
    };
    setPosts(prev => [newPost, ...prev]);
    setViewMode(ViewMode.FEED);
  };

  const handleCreateBoard = (newBoardData: Omit<Board, 'id' | 'memberCount'>) => {
    const newBoard: Board = {
      ...newBoardData,
      id: `b-${newBoardData.name.toLowerCase()}`,
      memberCount: 1
    };
    setBoards(prev => [...prev, newBoard]);
    setActiveBoardId(newBoard.id);
    setViewMode(ViewMode.FEED);
  };

  const handleComment = (postId: string, content: string) => {
    setPosts(currentPosts => 
      currentPosts.map(p => {
        if (p.id === postId) {
          const newComment = {
            id: `c-${Date.now()}`,
            author: userState.username,
            content: content,
            timestamp: Date.now()
          };
          return {
            ...p,
            commentCount: p.commentCount + 1,
            comments: [...p.comments, newComment]
          };
        }
        return p;
      })
    );
  };

  const handleViewBit = (postId: string) => {
    setSelectedBitId(postId);
    setViewMode(ViewMode.SINGLE_BIT);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToBoard = (boardId: string | null) => {
    setActiveBoardId(boardId);
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  };

  const returnToFeed = () => {
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  };

  const handleChangeUsername = (newUsername: string) => {
    setUserState(prev => ({ ...prev, username: newUsername }));
  };

  const getThemeColor = (id: ThemeId) => {
    switch(id) {
      case ThemeId.AMBER: return '#ffb000';
      case ThemeId.PHOSPHOR: return '#00ff41';
      case ThemeId.PLASMA: return '#00f0ff';
      case ThemeId.VERMILION: return '#ff4646';
      case ThemeId.SLATE: return '#c8c8c8';
      case ThemeId.BITBORING: return '#ffffff';
      default: return '#fff';
    }
  };

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono selection:bg-terminal-text selection:text-black relative">
      {/* Scanline Overlay */}
      <div className="scanlines fixed inset-0 pointer-events-none z-50"></div>

      <div className="max-w-[1074px] mx-auto p-4 md:p-6 relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b-2 border-terminal-dim pb-4 gap-4">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors"
            onClick={() => navigateToBoard(null)}
          >
            {theme === ThemeId.BITBORING ? (
              <div className="flex flex-col">
                <h1 className="text-3xl font-bold tracking-tight leading-none">BitBoring</h1>
                <span className="text-sm text-terminal-dim">( -_-) zzz</span>
              </div>
            ) : (
              <>
                <Terminal size={32} />
                <div className="flex flex-col">
                  <h1 className="text-4xl font-terminal tracking-wider leading-none">BitBoard</h1>
                  <span className="text-xs text-terminal-dim tracking-[0.2em]">DECENTRALIZED_NET</span>
                </div>
              </>
            )}
          </div>
          
          <nav className="flex gap-4 text-sm md:text-base">
            <button 
              onClick={() => navigateToBoard(null)}
              className={`uppercase hover:underline ${viewMode === ViewMode.FEED && activeBoardId === null ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
            >
              [ Global_Feed ]
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.CREATE)}
              className={`uppercase hover:underline ${viewMode === ViewMode.CREATE ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
            >
              [ New_Bit ]
            </button>
          </nav>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Sidebar */}
          <aside className="md:col-span-1 order-first md:order-last space-y-6">
            <BitStatus userState={userState} />
            
            {/* Board Directory */}
            <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
              <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
                <Hash size={14} /> FREQUENCY_LIST
              </h3>
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => navigateToBoard(null)}
                  className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                    ${activeBoardId === null ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
                  `}
                >
                  <Globe size={12} /> GLOBAL_NET
                </button>
                {boards.filter(b => b.isPublic).map(board => (
                   <button 
                    key={board.id}
                    onClick={() => navigateToBoard(board.id)}
                    className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                      ${activeBoardId === board.id ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
                    `}
                  >
                    <span>//</span> {board.name}
                  </button>
                ))}
                <div className="border-t border-terminal-dim/30 my-2"></div>
                {boards.filter(b => !b.isPublic).map(board => (
                   <button 
                    key={board.id}
                    disabled
                    className="text-left text-sm px-2 py-1 text-terminal-dim/50 flex items-center gap-2 cursor-not-allowed"
                  >
                    <Lock size={10} /> {board.name}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setViewMode(ViewMode.CREATE_BOARD)}
                className="mt-4 w-full text-xs border border-terminal-dim border-dashed text-terminal-dim p-2 hover:text-terminal-text hover:border-solid transition-all"
              >
                + INIT_NEW_BOARD
              </button>
            </div>

            {/* Theme Selector */}
            <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
              <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
                <Eye size={14} /> VISUAL_CONFIG
              </h3>
              <div className="grid grid-cols-3 gap-2 py-2">
                {Object.values(ThemeId).map(t => (
                  <button 
                    key={t}
                    onClick={() => setTheme(t)}
                    className="group flex items-center justify-center gap-0.5 font-mono text-sm transition-colors"
                    title={t === ThemeId.BITBORING ? "BITBORING (UGLY MODE)" : t.toUpperCase()}
                  >
                    <span className={`transition-colors ${theme === t ? 'text-terminal-text font-bold' : 'text-terminal-dim group-hover:text-terminal-text'}`}>[</span>
                    <span 
                      className={`w-3 h-3 mx-0.5 transition-transform ${theme === t ? 'scale-125' : 'scale-100 group-hover:scale-110'}`} 
                      style={{ 
                        backgroundColor: getThemeColor(t),
                        border: t === ThemeId.BITBORING ? '1px solid black' : 'none'
                      }}
                    />
                    <span className={`transition-colors ${theme === t ? 'text-terminal-text font-bold' : 'text-terminal-dim group-hover:text-terminal-text'}`}>]</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
              <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
                <HelpCircle size={14} /> USER_ID_CONFIG
              </h3>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-terminal-dim uppercase">Handle:</label>
                <input 
                  type="text"
                  value={userState.username}
                  onChange={(e) => handleChangeUsername(e.target.value)}
                  className="bg-terminal-bg border border-terminal-dim p-1 text-sm text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
                />
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="md:col-span-3">
            {viewMode === ViewMode.FEED && (
              <div className="space-y-2">
                {/* Feed Header */}
                <div className="flex justify-between items-end mb-6 pb-2 border-b border-terminal-dim/30">
                  <div>
                    <h2 className="text-2xl font-terminal uppercase tracking-widest text-terminal-text">
                       {activeBoard ? `// ${activeBoard.name}` : 'GLOBAL_FEED'}
                    </h2>
                    <p className="text-xs text-terminal-dim mt-1">
                      {activeBoard ? activeBoard.description : 'AGGREGATING TOP SIGNALS FROM PUBLIC SECTORS'}
                    </p>
                  </div>
                  <span className="text-xs border border-terminal-dim px-2 py-1">
                    SIGNAL_COUNT: {sortedPosts.length}
                  </span>
                </div>
                
                {sortedPosts.length === 0 && (
                   <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
                      <div className="text-4xl opacity-20">¯\_(ツ)_/¯</div>
                      <div>
                        <p className="font-bold">> NO DATA PACKETS FOUND</p>
                        <p className="text-xs mt-2">Be the first to transmit on this frequency.</p>
                      </div>
                      <button 
                        onClick={() => setViewMode(ViewMode.CREATE)}
                        className="mt-4 px-4 py-2 border border-terminal-dim hover:bg-terminal-dim hover:text-white transition-colors uppercase text-sm"
                      >
                        [ INIT_BIT ]
                      </button>
                   </div>
                )}

                {sortedPosts.map(post => (
                  <PostItem 
                    key={post.id} 
                    post={post} 
                    boardName={boards.find(b => b.id === post.boardId)?.name}
                    userState={userState}
                    onVote={handleVote}
                    onComment={handleComment}
                    onViewBit={handleViewBit}
                  />
                ))}
              </div>
            )}

            {viewMode === ViewMode.SINGLE_BIT && selectedPost && (
              <div className="animate-fade-in">
                <button 
                  onClick={returnToFeed}
                  className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  BACK TO {activeBoard ? `//${activeBoard.name}` : 'GLOBAL'}
                </button>

                <div className="border-t border-terminal-dim/30 pt-2">
                  <PostItem 
                    post={selectedPost} 
                    boardName={boards.find(b => b.id === selectedPost.boardId)?.name}
                    userState={userState}
                    onVote={handleVote}
                    onComment={handleComment}
                    onViewBit={() => {}} // No op
                    isFullPage={true}
                  />
                </div>
              </div>
            )}

            {viewMode === ViewMode.CREATE && (
              <CreatePost 
                availableBoards={boards.filter(b => b.isPublic)}
                currentBoardId={activeBoardId}
                activeUser={userState.username}
                onSubmit={handleCreatePost} 
                onCancel={returnToFeed} 
              />
            )}

            {viewMode === ViewMode.CREATE_BOARD && (
              <CreateBoard
                onSubmit={handleCreateBoard}
                onCancel={returnToFeed}
              />
            )}
          </main>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="text-center text-terminal-dim text-xs py-8 opacity-50">
        BitBoard DECENTRALIZED SYSTEM V2.0 // NODES ACTIVE: {boards.length}
      </footer>
    </div>
  );
}