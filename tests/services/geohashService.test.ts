import { describe, it, expect, vi } from 'vitest';
import { BoardType, GeohashPrecision } from '../../types';
import { geohashService, PRECISION_LABELS } from '../../services/geohashService';
import { geonetDiscoveryService } from '../../services/geonetDiscoveryService';

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('geohash feature core flow', () => {
  it('generates location boards for all supported precision levels', () => {
    const boards = geohashService.generateLocationBoards(40.7128, -74.006);

    expect(boards).toHaveLength(6);
    expect(boards.map((board) => board.precision)).toEqual([
      GeohashPrecision.COUNTRY,
      GeohashPrecision.REGION,
      GeohashPrecision.PROVINCE,
      GeohashPrecision.CITY,
      GeohashPrecision.NEIGHBORHOOD,
      GeohashPrecision.BLOCK,
    ]);

    boards.forEach((board) => {
      expect(board.type).toBe(BoardType.GEOHASH);
      expect(board.isPublic).toBe(true);
      expect(board.geohash).toBeTruthy();
      expect(board.id).toBe(`geo-${board.geohash}`);
      expect(board.name).toContain(PRECISION_LABELS[board.precision!]);
    });
  });

  it('creates a single geohash board with the expected shape', () => {
    const geohash = geohashService.encode(51.5072, -0.1276, GeohashPrecision.CITY);
    const board = geohashService.generateLocationBoard(geohash, GeohashPrecision.CITY);

    expect(board).toMatchObject({
      id: `geo-${geohash}`,
      type: BoardType.GEOHASH,
      geohash,
      precision: GeohashPrecision.CITY,
      isPublic: true,
    });
  });

  it('treats parent geohashes as containing child geohashes', () => {
    const allPrecisions = geohashService.getAllPrecisions(37.7749, -122.4194);

    expect(
      geohashService.isWithin(
        allPrecisions[GeohashPrecision.BLOCK],
        allPrecisions[GeohashPrecision.NEIGHBORHOOD],
      ),
    ).toBe(true);

    expect(
      geohashService.isWithin(
        allPrecisions[GeohashPrecision.NEIGHBORHOOD],
        allPrecisions[GeohashPrecision.BLOCK],
      ),
    ).toBe(false);
  });

  it('reports zero approximate distance for identical geohashes', () => {
    const geohash = geohashService.encode(48.8566, 2.3522, GeohashPrecision.CITY);
    expect(geohashService.approximateDistance(geohash, geohash)).toBe(0);
  });

  it('converts discovered geo channels into joinable boards', () => {
    const geohash = geohashService.encode(34.0522, -118.2437, GeohashPrecision.NEIGHBORHOOD);
    const board = geonetDiscoveryService.channelToBoard({
      geohash,
      precision: GeohashPrecision.NEIGHBORHOOD,
      postCount: 12,
      uniqueAuthors: 4,
      lastActivityAt: Date.now(),
      label: 'NEIGHBORHOOD',
      description: '~9.7km radius',
    });

    expect(board.type).toBe(BoardType.GEOHASH);
    expect(board.id).toBe(`geo-${geohash}`);
    expect(board.geohash).toBe(geohash);
    expect(board.precision).toBe(GeohashPrecision.NEIGHBORHOOD);
  });
});
