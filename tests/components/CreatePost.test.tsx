import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePost } from '../../components/CreatePost';
import { Board, BoardType } from '../../types';
import { scanLink } from '../../services/geminiService';
import { inputValidator, InputLimits } from '../../services/inputValidator';
import { rateLimiter } from '../../services/rateLimiter';

const CREATE_POST_TITLE_PATTERN = />\s*(COMPILE_NEW_BIT|CREATE[_ ]POST)/i;
const TITLE_PLACEHOLDER_PATTERN = /enter subject|descriptive title|post title/i;
const CONTENT_PLACEHOLDER_PATTERN = /data packet content|write your signal|post body/i;
const SUBMIT_BUTTON_PATTERN = /upload_bit|transmit bit|create post|submit/i;
const CANCEL_BUTTON_PATTERN = /abort|discard|cancel/i;
const SCAN_BUTTON_PATTERN = /scan_network|scan url|scan/i;
const TITLE_LABEL_PATTERN = /bit header|title/i;
const CONTENT_LABEL_PATTERN = /payload\s*\/\s*text|content|post body/i;
const URL_LABEL_PATTERN = /hyperlink|link/i;

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

  const getSubmitButton = () => screen.getByRole('button', { name: SUBMIT_BUTTON_PATTERN });
  const getCancelButton = () => screen.getByRole('button', { name: CANCEL_BUTTON_PATTERN });
  const getScanButton = () => screen.getByRole('button', { name: SCAN_BUTTON_PATTERN });
  const getTitleInput = () =>
    screen.queryByLabelText(TITLE_LABEL_PATTERN) ??
    screen.getByPlaceholderText(TITLE_PLACEHOLDER_PATTERN);
  const getContentInput = () =>
    screen.queryByLabelText(CONTENT_LABEL_PATTERN) ??
    screen.getByPlaceholderText(CONTENT_PLACEHOLDER_PATTERN);
  const getUrlInput = () =>
    screen.queryByLabelText(URL_LABEL_PATTERN) ??
    screen.getByPlaceholderText('https://example.com');

  describe('Initial Render', () => {
    it('should render the form with all required fields', () => {
      render(<CreatePost {...mockProps} />);

      expect(screen.getByText(CREATE_POST_TITLE_PATTERN)).toBeInTheDocument();
      expect(getTitleInput()).toBeInTheDocument();
      expect(getContentInput()).toBeInTheDocument();
      expect(screen.getByPlaceholderText('https://example.com')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('Auto-filled by scanner or enter manually...'),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('tech, discussion, news (comma separated)'),
      ).toBeInTheDocument();
      expect(getSubmitButton()).toBeInTheDocument();
      expect(getCancelButton()).toBeInTheDocument();
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

      expect(screen.getByRole('option', { name: /general/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /secret/i })).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should require title', async () => {
      render(<CreatePost {...mockProps} />);

      const submitButton = getSubmitButton();
      await user.click(submitButton);

      expect(screen.getByText('* Title is required')).toBeInTheDocument();
      expect(mockProps.onSubmit).not.toHaveBeenCalled();
    });

    it('should validate title length', async () => {
      const longTitle = 'a'.repeat(InputLimits.MAX_TITLE_LENGTH + 1);
      (inputValidator.validateTitle as Mock).mockReturnValue(null);

      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      await user.type(titleInput, longTitle);

      const submitButton = getSubmitButton();
      await user.click(submitButton);

      expect(
        screen.getByText(
          new RegExp(`title must be ${InputLimits.MAX_TITLE_LENGTH} characters or less`, 'i'),
        ),
      ).toBeInTheDocument();
    });

    it('should validate content length', async () => {
      const longContent = 'a'.repeat(InputLimits.MAX_POST_CONTENT_LENGTH + 1);
      (inputValidator.validateTitle as Mock).mockReturnValue('Valid Title');
      (inputValidator.validatePostContent as Mock).mockReturnValue(null);

      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      const contentTextarea = getContentInput();
      const submitButton = getSubmitButton();

      await user.type(titleInput, 'Valid Title');
      // Use fireEvent for long content to avoid timeout
      fireEvent.change(contentTextarea, { target: { value: longContent } });
      await user.click(submitButton);

      expect(
        screen.getByText(
          new RegExp(
            `content must be ${InputLimits.MAX_POST_CONTENT_LENGTH} characters or less`,
            'i',
          ),
        ),
      ).toBeInTheDocument();
    });

    it('should validate URL format', async () => {
      // Override the default mocks
      // Title validation should pass - return the title value when provided
      (inputValidator.validateTitle as Mock).mockImplementation((title) => {
        return title && title.trim() ? title : null;
      });
      // URL validation should fail (return null for invalid URLs)
      // Use mockReturnValue instead of mockImplementation to ensure it always returns null
      (inputValidator.validateUrl as Mock).mockReturnValue(null);

      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      const urlInput = screen.getByPlaceholderText('https://example.com');
      const form = titleInput.closest('form');
      const submitButton = getSubmitButton();

      // Type title and URL - ensure both are set
      await user.type(titleInput, 'Valid Title');
      await user.type(urlInput, 'invalid-url');

      // Verify both inputs have values before submitting
      expect(titleInput).toHaveValue('Valid Title');
      expect(urlInput).toHaveValue('invalid-url');

      // Submit the form directly to ensure form submission is triggered
      // The form's handleSubmit calls validateForm() which should validate the URL
      // If URL validation fails, setUrlError('Invalid URL format') is called
      // and the form submission is prevented
      if (form) {
        fireEvent.submit(form);
      } else {
        await user.click(submitButton);
      }

      // Verify onSubmit was not called due to validation failure
      expect(mockProps.onSubmit).not.toHaveBeenCalled();

      // Verify that validateUrl was called with the trimmed URL
      expect(inputValidator.validateUrl).toHaveBeenCalledWith('invalid-url');

      // The error message "* Invalid URL format" should appear after validation
      // The error is rendered conditionally: {urlError && <span>* {urlError}</span>}
      // Wait for React to re-render with the error state
      await waitFor(
        () => {
          expect(screen.getByText(/\* Invalid URL format/i)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('should clear validation errors when input changes', async () => {
      render(<CreatePost {...mockProps} />);

      const submitButton = getSubmitButton();
      await user.click(submitButton);

      expect(screen.getByText('* Title is required')).toBeInTheDocument();

      const titleInput = getTitleInput();
      await user.type(titleInput, 'Valid Title');

      expect(screen.queryByText('* Title is required')).not.toBeInTheDocument();
    });

    it('should allow submit button click when title is empty to show validation', () => {
      render(<CreatePost {...mockProps} />);

      const submitButton = getSubmitButton();
      // Button is enabled to allow validation errors to be shown
      expect(submitButton).not.toBeDisabled();
    });

    it('should enable submit button when title is provided', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      const submitButton = getSubmitButton();

      await user.type(titleInput, 'Valid Title');

      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Character Counting', () => {
    it('should display character count for title', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      await user.type(titleInput, 'Test Title');

      expect(screen.getByText(`10/${InputLimits.MAX_TITLE_LENGTH}`)).toBeInTheDocument();
    });

    it('should display character count for content', async () => {
      render(<CreatePost {...mockProps} />);

      const contentTextarea = getContentInput();
      await user.type(contentTextarea, 'Test content');

      expect(screen.getByText(`12/${InputLimits.MAX_POST_CONTENT_LENGTH}`)).toBeInTheDocument();
    });

    it('should show warning color when title exceeds limit', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      const longTitle = 'a'.repeat(InputLimits.MAX_TITLE_LENGTH + 1);
      await user.type(titleInput, longTitle);

      const charCount = screen.getByText(`${longTitle.length}/${InputLimits.MAX_TITLE_LENGTH}`);
      expect(charCount).toHaveClass('text-terminal-alert');
    });

    it('should show warning color when content exceeds limit', async () => {
      render(<CreatePost {...mockProps} />);

      const contentTextarea = getContentInput();
      const longContent = 'a'.repeat(InputLimits.MAX_POST_CONTENT_LENGTH + 1);
      // Use paste instead of type for long content to avoid timeout
      await user.clear(contentTextarea);
      fireEvent.change(contentTextarea, { target: { value: longContent } });

      const charCount = screen.getByText(
        `${longContent.length}/${InputLimits.MAX_POST_CONTENT_LENGTH}`,
      );
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

      const urlInput = getUrlInput();
      const scanButton = getScanButton();

      await user.type(urlInput, 'https://example.com');
      await user.click(scanButton);

      expect(scanLink).toHaveBeenCalledWith('https://example.com');
    });

    it('should validate URL before scanning', async () => {
      (inputValidator.validateUrl as Mock).mockReturnValue(null);

      render(<CreatePost {...mockProps} />);

      const urlInput = getUrlInput();
      const scanButton = getScanButton();

      await user.type(urlInput, 'invalid-url');
      await user.click(scanButton);

      expect(scanLink).not.toHaveBeenCalled();
      expect(screen.getByText('* Invalid URL format')).toBeInTheDocument();
    });

    it('should disable scan button when URL is empty', () => {
      render(<CreatePost {...mockProps} />);

      const scanButton = getScanButton();
      expect(scanButton).toBeDisabled();
    });

    it('should show loading state during scan', async () => {
      (scanLink as Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      render(<CreatePost {...mockProps} />);

      const urlInput = getUrlInput();
      const scanButton = getScanButton();

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

      const urlInput = getUrlInput();
      const scanButton = getScanButton();

      await user.type(urlInput, 'https://example.com');
      await user.click(scanButton);

      await waitFor(() => {
        const titleInput = getTitleInput() as HTMLInputElement;
        const contentTextarea = getContentInput() as HTMLTextAreaElement;

        expect(titleInput.value).toBe('Scanned Title');
        expect(contentTextarea.value).toBe('Scanned description');
        expect(screen.getByAltText('Link Preview')).toHaveAttribute(
          'src',
          'https://example.com/image.jpg',
        );
      });
    });

    it('should not overwrite existing title when scanning', async () => {
      (scanLink as Mock).mockResolvedValue({
        title: 'Scanned Title',
        description: 'Scanned description',
      });

      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      const urlInput = getUrlInput();
      const scanButton = getScanButton();

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

      const urlInput = getUrlInput();
      const scanButton = getScanButton();

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

      const urlInput = getUrlInput();
      const scanButton = getScanButton();

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

      const titleInput = getTitleInput();
      const submitButton = getSubmitButton();

      await user.type(titleInput, 'Test Title');
      await user.click(submitButton);

      expect(screen.getByText(/Rate limit exceeded/i)).toBeInTheDocument();
      expect(mockProps.onSubmit).not.toHaveBeenCalled();
    });

    it('should call rate limiter with correct parameters', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      const contentTextarea = getContentInput();
      const submitButton = getSubmitButton();

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

      const titleInput = getTitleInput();
      const contentTextarea = getContentInput();
      const urlInput = getUrlInput();
      const tagsInput = screen.getByLabelText(/tags/i);
      const submitButton = getSubmitButton();

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

      const titleInput = getTitleInput();
      const contentTextarea = getContentInput();
      const urlInput = getUrlInput();
      const imageInput = screen.getByLabelText(/attached image asset/i);
      const tagsInput = screen.getByLabelText(/tags/i);
      const submitButton = getSubmitButton();

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

      const titleInput = getTitleInput();
      const submitButton = getSubmitButton();

      await user.type(titleInput, 'Test Title');
      await user.click(submitButton);

      const callArgs = mockProps.onSubmit.mock.calls[0][0];
      expect(callArgs.tags).toEqual(['general']);
    });

    it('should handle board selection changes', async () => {
      render(<CreatePost {...mockProps} />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'board-2');

      const titleInput = getTitleInput();
      const submitButton = getSubmitButton();

      await user.type(titleInput, 'Test Title');
      await user.click(submitButton);

      const callArgs = mockProps.onSubmit.mock.calls[0][0];
      expect(callArgs.boardId).toBe('board-2');
    });

    it('should show submitting state during form submission', async () => {
      render(<CreatePost {...mockProps} />);

      const titleInput = getTitleInput();
      const submitButton = getSubmitButton();

      await user.type(titleInput, 'Test Title');

      // Mock onSubmit to be async and take some time
      mockProps.onSubmit.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      await user.click(submitButton);

      expect(screen.getByText('> TRANSMITTING...')).toBeInTheDocument();
    });
  });

  describe('Cancel Action', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      render(<CreatePost {...mockProps} />);

      const cancelButton = getCancelButton();
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

      expect(getTitleInput()).toHaveAttribute('type', 'text');
      // Textarea elements don't have a type attribute - check tagName instead
      expect(getContentInput().tagName).toBe('TEXTAREA');
      expect(getUrlInput()).toHaveAttribute('type', 'url');
      expect(screen.getByLabelText(/attached image asset/i)).toHaveAttribute('type', 'text');
    });

    it('should show validation errors with proper styling', async () => {
      render(<CreatePost {...mockProps} />);

      const submitButton = getSubmitButton();
      await user.click(submitButton);

      const errorMessage = screen.getByText('* Title is required');
      expect(errorMessage).toHaveClass('text-terminal-alert');
    });
  });
});
