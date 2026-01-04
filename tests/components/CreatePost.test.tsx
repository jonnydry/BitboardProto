import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent as _fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePost } from '../../components/CreatePost';
import { Board, BoardType } from '../../types';
import { scanLink } from '../../services/geminiService';
import { inputValidator, InputLimits } from '../../services/inputValidator';
import { rateLimiter } from '../../services/rateLimiter';

// Mock dependencies
vi.mock('../../services/geminiService');
vi.mock('../../services/inputValidator');
vi.mock('../../services/rateLimiter');

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Loader: () => <div data-testid="loader">Loading...</div>,
  ImageIcon: () => <div data-testid="image-icon">Image</div>,
  AlertTriangle: () => <div data-testid="alert-triangle">Alert</div>,
  Lock: () => <div data-testid="lock">Lock</div>,
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

    // Setup default mocks
    (scanLink as Mock).mockResolvedValue(null);
    (inputValidator.validateTitle as Mock).mockImplementation((title) => title);
    (inputValidator.validatePostContent as Mock).mockImplementation((content) => content);
    (inputValidator.validateUrl as Mock).mockImplementation((url) => url);
    (inputValidator.validateTags as Mock).mockImplementation((tags) => tags);
    (rateLimiter.allowPost as Mock).mockReturnValue(true);
    (rateLimiter.hashContent as Mock).mockReturnValue('hash123');
  });

  describe('Initial Render', () => {
    it('should render the form with all required fields', () => {
      render(<CreatePost {...mockProps} />);

      expect(screen.getByText('> COMPILE_NEW_BIT')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter subject...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter data packet content...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('https://example.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Auto-filled by scanner or enter manually...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('tech, discussion, news (comma separated)')).toBeInTheDocument();
      expect(screen.getByText('[ UPLOAD_BIT ]')).toBeInTheDocument();
      expect(screen.getByText('[ ABORT ]')).toBeInTheDocument();
    });

    it('should display user ID in header', () => {
      render(<CreatePost {...mockProps} />);

      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    it('should pre-select the first board if no current board is provided', () => {
      render(<CreatePost {...mockProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('board-1');
    });

    it('should pre-select the specified current board', () => {
      render(<CreatePost {...mockProps} currentBoardId="board-2" />);

      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('board-2');
    });

    it('should show encrypted board warning when encrypted board is selected', async () => {
      render(<CreatePost {...mockProps} />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'board-2');

      expect(screen.getByText(/this board is encrypted/i)).toBeInTheDocument();
      expect(screen.getByTestId('lock')).toBeInTheDocument();
    });

    it('should display board options with appropriate indicators', () => {
      render(<CreatePost {...mockProps} />);

      expect(screen.getByText('//General')).toBeInTheDocument();
      expect(screen.getByText('//Secret [LOCKED] 🔒')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should require title', async () => {
      render(<CreatePost {...mockProps} />);

      const submitButton = screen.getByText('[ UPLOAD_BIT ]');
      await user.click(submitButton);

      expect(screen.getByText('* Title is required')).toBeInTheDocument();
      expect(mockProps.onSubmit).not.toHaveBeenCalled();
    });

    it('should validate title length', async () => {
      const longTitle = 'a'.repeat(InputLimits.MAX_TITLE_LENGTH + 1);
      (inputValidator.validateTitle as Mock).mockReturnValue(null);

      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      await user.type(titleInput, longTitle);

      const submitButton = screen.getByText('[ UPLOAD_BIT ]');
      await user.click(submitButton);

      expect(screen.getByText(new RegExp(`title must be ${InputLimits.MAX_TITLE_LENGTH} characters or less`, 'i'))).toBeInTheDocument();
    });

    it('should validate content length', async () => {
      const longContent = 'a'.repeat(InputLimits.MAX_POST_CONTENT_LENGTH + 1);
      (inputValidator.validateTitle as Mock).mockReturnValue('Valid Title');
      (inputValidator.validatePostContent as Mock).mockReturnValue(null);

      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      const contentTextarea = screen.getByPlaceholderText('Enter data packet content...');
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Valid Title');
      await user.type(contentTextarea, longContent);
      await user.click(submitButton);

      expect(screen.getByText(new RegExp(`content must be ${InputLimits.MAX_POST_CONTENT_LENGTH} characters or less`, 'i'))).toBeInTheDocument();
    });

    it('should validate URL format', async () => {
      (inputValidator.validateTitle as Mock).mockReturnValue('Valid Title');
      (inputValidator.validateUrl as Mock).mockReturnValue(null);

      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      const urlInput = screen.getByPlaceholderText('https://example.com');
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Valid Title');
      await user.type(urlInput, 'invalid-url');
      await user.click(submitButton);

      expect(screen.getByText('* Invalid URL format')).toBeInTheDocument();
    });

    it('should clear validation errors when input changes', async () => {
      render(<CreatePost {...mockProps} />);

      const submitButton = screen.getByText('[ UPLOAD_BIT ]');
      await user.click(submitButton);

      expect(screen.getByText('* Title is required')).toBeInTheDocument();

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      await user.type(titleInput, 'Valid Title');

      expect(screen.queryByText('* Title is required')).not.toBeInTheDocument();
    });

    it('should disable submit button when title is empty', () => {
      render(<CreatePost {...mockProps} />);

      const submitButton = screen.getByText('[ UPLOAD_BIT ]');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when title is provided', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Valid Title');

      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Character Counting', () => {
    it('should display character count for title', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      await user.type(titleInput, 'Test Title');

      expect(screen.getByText(`10/${InputLimits.MAX_TITLE_LENGTH}`)).toBeInTheDocument();
    });

    it('should display character count for content', async () => {
      render(<CreatePost {...mockProps} />);

      const contentTextarea = screen.getByPlaceholderText('Enter data packet content...');
      await user.type(contentTextarea, 'Test content');

      expect(screen.getByText(`12/${InputLimits.MAX_POST_CONTENT_LENGTH}`)).toBeInTheDocument();
    });

    it('should show warning color when title exceeds limit', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      const longTitle = 'a'.repeat(InputLimits.MAX_TITLE_LENGTH + 1);
      await user.type(titleInput, longTitle);

      const charCount = screen.getByText(`${longTitle.length}/${InputLimits.MAX_TITLE_LENGTH}`);
      expect(charCount).toHaveClass('text-terminal-alert');
    });

    it('should show warning color when content exceeds limit', async () => {
      render(<CreatePost {...mockProps} />);

      const contentTextarea = screen.getByPlaceholderText('Enter data packet content...');
      const longContent = 'a'.repeat(InputLimits.MAX_POST_CONTENT_LENGTH + 1);
      await user.type(contentTextarea, longContent);

      const charCount = screen.getByText(`${longContent.length}/${InputLimits.MAX_POST_CONTENT_LENGTH}`);
      expect(charCount).toHaveClass('text-terminal-alert');
    });
  });

  describe('Link Scanning', () => {
    it('should scan link when scan button is clicked', async () => {
      (scanLink as Mock).mockResolvedValue({
        title: 'Scanned Title',
        description: 'Scanned description',
        imageUrl: 'https://example.com/image.jpg',
      });

      render(<CreatePost {...mockProps} />);

      const urlInput = screen.getByLabelText(/hyperlink/i);
      const scanButton = screen.getByText('[ SCAN_NETWORK ]');

      await user.type(urlInput, 'https://example.com');
      await user.click(scanButton);

      expect(scanLink).toHaveBeenCalledWith('https://example.com');
    });

    it('should validate URL before scanning', async () => {
      (inputValidator.validateUrl as Mock).mockReturnValue(null);

      render(<CreatePost {...mockProps} />);

      const urlInput = screen.getByLabelText(/hyperlink/i);
      const scanButton = screen.getByText('[ SCAN_NETWORK ]');

      await user.type(urlInput, 'invalid-url');
      await user.click(scanButton);

      expect(scanLink).not.toHaveBeenCalled();
      expect(screen.getByText('* Invalid URL format')).toBeInTheDocument();
    });

    it('should disable scan button when URL is empty', () => {
      render(<CreatePost {...mockProps} />);

      const scanButton = screen.getByText('[ SCAN_NETWORK ]');
      expect(scanButton).toBeDisabled();
    });

    it('should show loading state during scan', async () => {
      (scanLink as Mock).mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<CreatePost {...mockProps} />);

      const urlInput = screen.getByLabelText(/hyperlink/i);
      const scanButton = screen.getByText('[ SCAN_NETWORK ]');

      await user.type(urlInput, 'https://example.com');
      await user.click(scanButton);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(scanButton).toBeDisabled();
    });

    it('should populate form fields with scanned data', async () => {
      (scanLink as Mock).mockResolvedValue({
        title: 'Scanned Title',
        description: 'Scanned description',
        imageUrl: 'https://example.com/image.jpg',
      });

      render(<CreatePost {...mockProps} />);

      const urlInput = screen.getByLabelText(/hyperlink/i);
      const scanButton = screen.getByText('[ SCAN_NETWORK ]');

      await user.type(urlInput, 'https://example.com');
      await user.click(scanButton);

      await waitFor(() => {
        const titleInput = screen.getByLabelText(/bit header/i) as HTMLInputElement;
        const contentTextarea = screen.getByLabelText(/payload \/ text/i) as HTMLTextAreaElement;

        expect(titleInput.value).toBe('Scanned Title');
        expect(contentTextarea.value).toBe('Scanned description');
        expect(screen.getByAltText('Link Preview')).toHaveAttribute('src', 'https://example.com/image.jpg');
      });
    });

    it('should not overwrite existing title when scanning', async () => {
      (scanLink as Mock).mockResolvedValue({
        title: 'Scanned Title',
        description: 'Scanned description',
      });

      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByLabelText(/bit header/i);
      const urlInput = screen.getByLabelText(/hyperlink/i);
      const scanButton = screen.getByText('[ SCAN_NETWORK ]');

      await user.type(titleInput, 'Existing Title');
      await user.type(urlInput, 'https://example.com');
      await user.click(scanButton);

      await waitFor(() => {
        expect(titleInput).toHaveValue('Existing Title');
      });
    });

    it('should show image preview when image is detected', async () => {
      (scanLink as Mock).mockResolvedValue({
        title: 'Scanned Title',
        imageUrl: 'https://example.com/image.jpg',
      });

      render(<CreatePost {...mockProps} />);

      const urlInput = screen.getByLabelText(/hyperlink/i);
      const scanButton = screen.getByText('[ SCAN_NETWORK ]');

      await user.type(urlInput, 'https://example.com');
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByAltText('Link Preview')).toBeInTheDocument();
        expect(screen.getByText('PREVIEW_ASSET_DETECTED')).toBeInTheDocument();
      });
    });

    it('should allow removing image preview', async () => {
      (scanLink as Mock).mockResolvedValue({
        title: 'Scanned Title',
        imageUrl: 'https://example.com/image.jpg',
      });

      render(<CreatePost {...mockProps} />);

      const urlInput = screen.getByLabelText(/hyperlink/i);
      const scanButton = screen.getByText('[ SCAN_NETWORK ]');

      await user.type(urlInput, 'https://example.com');
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByAltText('Link Preview')).toBeInTheDocument();
      });

      const removeButton = screen.getByText('REMOVE');
      await user.click(removeButton);

      expect(screen.queryByAltText('Link Preview')).not.toBeInTheDocument();
    });
  });

  describe('Rate Limiting', () => {
    it('should show rate limit error when posting too frequently', async () => {
      (rateLimiter.allowPost as Mock).mockReturnValue(false);

      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Test Title');
      await user.click(submitButton);

      expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
      expect(mockProps.onSubmit).not.toHaveBeenCalled();
    });

    it('should call rate limiter with correct parameters', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByPlaceholderText('Enter subject...');
      const contentTextarea = screen.getByPlaceholderText('Enter data packet content...');
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Test Title');
      await user.type(contentTextarea, 'Test Content');
      await user.click(submitButton);

      expect(rateLimiter.hashContent).toHaveBeenCalledWith('Test TitleTest Content');
      expect(rateLimiter.allowPost).toHaveBeenCalledWith('test-pubkey', 'hash123');
    });
  });

  describe('Form Submission', () => {
    it('should submit valid form data', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByLabelText(/bit header/i);
      const contentTextarea = screen.getByLabelText(/payload \/ text/i);
      const urlInput = screen.getByLabelText(/hyperlink/i);
      const tagsInput = screen.getByLabelText(/tags/i);
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Test Title');
      await user.type(contentTextarea, 'Test Content');
      await user.type(urlInput, 'https://example.com');
      await user.type(tagsInput, 'tech, news');
      await user.click(submitButton);

      expect(mockProps.onSubmit).toHaveBeenCalledWith({
        boardId: 'board-1',
        title: 'Test Title',
        content: 'Test Content',
        url: 'https://example.com',
        imageUrl: undefined,
        linkDescription: undefined,
        author: 'testuser',
        authorPubkey: 'test-pubkey',
        tags: ['tech', 'news'],
        upvotes: 1,
        downvotes: 0,
      });
    });

    it('should sanitize and validate all inputs before submission', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByLabelText(/bit header/i);
      const contentTextarea = screen.getByLabelText(/payload \/ text/i);
      const urlInput = screen.getByLabelText(/hyperlink/i);
      const imageInput = screen.getByLabelText(/attached image asset/i);
      const tagsInput = screen.getByLabelText(/tags/i);
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Test Title');
      await user.type(contentTextarea, 'Test Content');
      await user.type(urlInput, 'https://example.com');
      await user.type(imageInput, 'https://example.com/image.jpg');
      await user.type(tagsInput, 'tag1, tag2, invalid<>tag');
      await user.click(submitButton);

      expect(inputValidator.validateTitle).toHaveBeenCalledWith('Test Title');
      expect(inputValidator.validatePostContent).toHaveBeenCalledWith('Test Content');
      expect(inputValidator.validateUrl).toHaveBeenCalledWith('https://example.com');
      expect(inputValidator.validateUrl).toHaveBeenCalledWith('https://example.com/image.jpg');
      expect(inputValidator.validateTags).toHaveBeenCalledWith(['tag1', 'tag2', 'invalid<>tag']);
    });

    it('should use default tags when no tags provided', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByLabelText(/bit header/i);
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Test Title');
      await user.click(submitButton);

      const callArgs = mockProps.onSubmit.mock.calls[0][0];
      expect(callArgs.tags).toEqual(['general']);
    });

    it('should handle board selection changes', async () => {
      render(<CreatePost {...mockProps} />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'board-2');

      const titleInput = screen.getByLabelText(/bit header/i);
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Test Title');
      await user.click(submitButton);

      const callArgs = mockProps.onSubmit.mock.calls[0][0];
      expect(callArgs.boardId).toBe('board-2');
    });

    it('should show submitting state during form submission', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = screen.getByLabelText(/bit header/i);
      const submitButton = screen.getByText('[ UPLOAD_BIT ]');

      await user.type(titleInput, 'Test Title');

      // Mock onSubmit to be async and take some time
      mockProps.onSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      await user.click(submitButton);

      expect(screen.getByText('> TRANSMITTING...')).toBeInTheDocument();
    });
  });

  describe('Cancel Action', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      render(<CreatePost {...mockProps} />);

      const cancelButton = screen.getByText('[ ABORT ]');
      await user.click(cancelButton);

      expect(mockProps.onCancel).toHaveBeenCalled();
    });

    it('should call onCancel when escape key is pressed', async () => {
      render(<CreatePost {...mockProps} />);

      await user.keyboard('{Escape}');

      expect(mockProps.onCancel).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<CreatePost {...mockProps} />);

      expect(screen.getByLabelText(/bit header/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/payload \/ text/i)).toHaveAttribute('type', 'textarea');
      expect(screen.getByLabelText(/hyperlink/i)).toHaveAttribute('type', 'url');
      expect(screen.getByLabelText(/attached image asset/i)).toHaveAttribute('type', 'text');
    });

    it('should show validation errors with proper styling', async () => {
      render(<CreatePost {...mockProps} />);

      const submitButton = screen.getByText('[ UPLOAD_BIT ]');
      await user.click(submitButton);

      const errorMessage = screen.getByText('* Title is required');
      expect(errorMessage).toHaveClass('text-terminal-alert');
    });
  });
});
