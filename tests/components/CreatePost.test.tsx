import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePost } from '../../components/CreatePost';
import { Board, BoardType } from '../../types';
import { scanLink } from '../../services/geminiService';
import { inputValidator, InputLimits } from '../../services/inputValidator';
import { rateLimiter } from '../../services/rateLimiter';

vi.mock('../../services/geminiService');
vi.mock('../../services/inputValidator');
vi.mock('../../services/rateLimiter');

vi.mock('../../components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

vi.mock('lucide-react', () => ({
  Loader: () => <div data-testid="loader">Loading...</div>,
  AlertTriangle: () => <div data-testid="alert-triangle">Alert</div>,
  Lock: () => <div data-testid="lock">Lock</div>,
  X: () => <span data-testid="x-icon">×</span>,
}));

describe('CreatePost', () => {
  const mockBoards: Board[] = [
    {
      id: 'board-1',
      name: 'General',
      description: 'General discussion',
      isPublic: true,
      memberCount: 100,
      type: BoardType.TOPIC,
      createdBy: 'pubkey1',
      isEncrypted: false,
    },
    {
      id: 'board-2',
      name: 'Secret',
      description: 'Encrypted board',
      isPublic: false,
      memberCount: 10,
      type: BoardType.TOPIC,
      createdBy: 'pubkey1',
      isEncrypted: true,
    },
  ];

  const mockProps = {
    availableBoards: mockBoards,
    currentBoardId: null,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    activeUser: 'testuser',
    userPubkey: 'test-pubkey',
  };

  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
    localStorage.removeItem('bitboard_post_draft');

    (scanLink as Mock).mockResolvedValue(null);
    (inputValidator.validateTitle as Mock).mockImplementation((title: string) => title);
    (inputValidator.validatePostContent as Mock).mockImplementation((content: string) => content);
    (inputValidator.validateUrl as Mock).mockImplementation((url: string) => url);
    (inputValidator.validateTags as Mock).mockImplementation((tags: string[]) => tags);
    (rateLimiter.allowPost as Mock).mockReturnValue(true);
    (rateLimiter.hashContent as Mock).mockReturnValue('hash123');
  });

  it('renders composer with title, body, link, and actions', () => {
    render(<CreatePost {...mockProps} />);

    expect(screen.getByText('New Bit')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Title your bit…')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Write your signal/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/https:\/\//i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /transmit bit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('pre-selects first board when no current board', () => {
    render(<CreatePost {...mockProps} />);
    expect(screen.getByRole('combobox')).toHaveValue('board-1');
  });

  it('pre-selects current board when provided', () => {
    render(<CreatePost {...mockProps} currentBoardId="board-2" />);
    expect(screen.getByRole('combobox')).toHaveValue('board-2');
  });

  it('shows encrypted hint when encrypted board selected', async () => {
    render(<CreatePost {...mockProps} />);
    await user.selectOptions(screen.getByRole('combobox'), 'board-2');
    expect(screen.getByText('encrypted')).toBeInTheDocument();
    expect(screen.getByTestId('lock')).toBeInTheDocument();
  });

  it('requires title before submit', async () => {
    render(<CreatePost {...mockProps} />);
    await user.click(screen.getByRole('button', { name: /transmit bit/i }));
    expect(screen.getByText('* Title is required')).toBeInTheDocument();
    expect(mockProps.onSubmit).not.toHaveBeenCalled();
  });

  it('submits when title is valid', async () => {
    render(<CreatePost {...mockProps} />);
    await user.type(screen.getByPlaceholderText('Title your bit…'), 'Hello');
    await user.click(screen.getByRole('button', { name: /transmit bit/i }));

    expect(mockProps.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: 'board-1',
        title: 'Hello',
        author: 'testuser',
        authorPubkey: 'test-pubkey',
        tags: ['general'],
      }),
    );
  });

  it('validates content length', async () => {
    const longContent = 'a'.repeat(InputLimits.MAX_POST_CONTENT_LENGTH + 1);
    (inputValidator.validateTitle as Mock).mockReturnValue('T');
    (inputValidator.validatePostContent as Mock).mockReturnValue(null);

    render(<CreatePost {...mockProps} />);
    await user.type(screen.getByPlaceholderText('Title your bit…'), 'T');
    fireEvent.change(screen.getByPlaceholderText(/Write your signal/i), {
      target: { value: longContent },
    });
    await user.click(screen.getByRole('button', { name: /transmit bit/i }));

    expect(
      screen.getByText(
        new RegExp(`content must be ${InputLimits.MAX_POST_CONTENT_LENGTH} characters or less`, 'i'),
      ),
    ).toBeInTheDocument();
  });

  it('shows rate limit banner when blocked', async () => {
    (rateLimiter.allowPost as Mock).mockReturnValue(false);
    render(<CreatePost {...mockProps} />);
    await user.type(screen.getByPlaceholderText('Title your bit…'), 'T');
    await user.click(screen.getByRole('button', { name: /transmit bit/i }));
    expect(screen.getByText(/Rate limit exceeded/i)).toBeInTheDocument();
    expect(mockProps.onSubmit).not.toHaveBeenCalled();
  });

  it('scans link when Scan clicked', async () => {
    (scanLink as Mock).mockResolvedValue({
      title: 'Scanned',
      description: 'Desc',
      imageUrl: 'https://example.com/i.jpg',
    });

    render(<CreatePost {...mockProps} />);
    const urlInput = screen.getByPlaceholderText(/https:\/\//i);
    await user.type(urlInput, 'https://example.com');
    await user.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => {
      expect(scanLink).toHaveBeenCalledWith('https://example.com');
      expect(screen.getByDisplayValue('Scanned')).toBeInTheDocument();
    });
    expect(screen.getByAltText('Link preview')).toHaveAttribute('src', 'https://example.com/i.jpg');
  });

  it('calls onCancel when Discard clicked', async () => {
    render(<CreatePost {...mockProps} />);
    await user.click(screen.getByRole('button', { name: /discard/i }));
    expect(mockProps.onCancel).toHaveBeenCalled();
  });

  it('shows submitting state', async () => {
    mockProps.onSubmit.mockImplementation(() => new Promise(() => undefined));
    render(<CreatePost {...mockProps} />);
    await user.type(screen.getByPlaceholderText('Title your bit…'), 'T');
    await user.click(screen.getByRole('button', { name: /transmit bit/i }));
    expect(screen.getByText('Transmitting…')).toBeInTheDocument();
  });
});
