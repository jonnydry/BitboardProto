import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkPreview } from '../../components/LinkPreview';
import { fetchLinkPreview, getCachedPreview } from '../../services/linkPreviewService';

// Mock the link preview service
vi.mock('../../services/linkPreviewService', () => ({
  fetchLinkPreview: vi.fn(),
  getCachedPreview: vi.fn(),
}));

const mockFetchLinkPreview = vi.mocked(fetchLinkPreview);
const mockGetCachedPreview = vi.mocked(getCachedPreview);

// Mock URL.createObjectURL and revokeObjectURL for image handling
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn(() => 'mock-object-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
});

describe('LinkPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    mockGetCachedPreview.mockReturnValue(null);
    // Keep the promise pending to see loading state
    mockFetchLinkPreview.mockImplementation(() => new Promise(() => {}));

    const { container } = render(<LinkPreview url="https://example.com" />);

    // Loading state shows a pulsing skeleton with animate-pulse class
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders preview with title and description', async () => {
    mockGetCachedPreview.mockReturnValue(null);
    mockFetchLinkPreview.mockResolvedValue({
      url: 'https://example.com',
      title: 'Test Title',
      description: 'Test Description',
      siteName: 'Example Site',
      favicon: 'https://example.com/favicon.ico',
    });

    render(<LinkPreview url="https://example.com" />);

    await waitFor(() => {
      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Description')).toBeInTheDocument();
    // When siteName is provided, it displays that instead of the domain
    expect(screen.getByText('Example Site')).toBeInTheDocument();
  });

  it('renders compact mode correctly', async () => {
    mockGetCachedPreview.mockReturnValue(null);
    mockFetchLinkPreview.mockResolvedValue({
      url: 'https://example.com',
      title: 'Test Title',
      siteName: 'Example Site',
    });

    render(<LinkPreview url="https://example.com" compact />);

    await waitFor(() => {
      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    // Compact mode should show title and external link icon
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('handles cached previews', () => {
    const cachedPreview = {
      url: 'https://example.com',
      title: 'Cached Title',
      description: 'Cached Description',
    };

    mockGetCachedPreview.mockReturnValue(cachedPreview);

    render(<LinkPreview url="https://example.com" />);

    expect(screen.getByText('Cached Title')).toBeInTheDocument();
    expect(screen.getByText('Cached Description')).toBeInTheDocument();

    // Should not call fetch when cached
    expect(mockFetchLinkPreview).not.toHaveBeenCalled();
  });

  it('handles fetch errors gracefully', async () => {
    mockGetCachedPreview.mockReturnValue(null);
    mockFetchLinkPreview.mockRejectedValue(new Error('Network error'));

    render(<LinkPreview url="https://example.com" />);

    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeInTheDocument();
    });

    // Should show fallback content
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('opens link in new tab when clicked', async () => {
    const user = userEvent.setup();
    mockGetCachedPreview.mockReturnValue(null);
    mockFetchLinkPreview.mockResolvedValue({
      url: 'https://example.com',
      title: 'Test Title',
    });

    // Mock window.open
    const mockOpen = vi.fn();
    Object.defineProperty(window, 'open', {
      writable: true,
      value: mockOpen,
    });

    render(<LinkPreview url="https://example.com" />);

    await waitFor(() => {
      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    const link = screen.getByRole('link');
    await user.click(link);

    // Should open in new tab (target="_blank")
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('applies custom className', async () => {
    mockGetCachedPreview.mockReturnValue(null);
    mockFetchLinkPreview.mockResolvedValue({
      url: 'https://example.com',
      title: 'Test Title',
    });

    render(<LinkPreview url="https://example.com" className="custom-class" />);

    await waitFor(() => {
      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    const container = screen.getByText('Test Title').closest('a');
    expect(container).toHaveClass('custom-class');
  });

  it('extracts domain correctly from various URLs', async () => {
    mockGetCachedPreview.mockReturnValue(null);
    mockFetchLinkPreview.mockResolvedValue({
      url: 'https://sub.example.com/path',
      title: 'Test Title',
    });

    render(<LinkPreview url="https://sub.example.com/path" />);

    await waitFor(() => {
      expect(screen.getByText('sub.example.com')).toBeInTheDocument();
    });
  });

  it('handles malformed URLs', async () => {
    mockGetCachedPreview.mockReturnValue(null);
    mockFetchLinkPreview.mockResolvedValue({
      url: 'not-a-url',
      error: 'Invalid URL',
    });

    render(<LinkPreview url="not-a-url" />);

    await waitFor(() => {
      // Multiple elements may contain the URL text (domain display + link display)
      const urlElements = screen.getAllByText('not-a-url');
      expect(urlElements.length).toBeGreaterThan(0);
    });
  });
});
