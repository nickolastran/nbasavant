import { json } from '@/lib/api';

const seasonParam = {
  name: 'season', in: 'query', schema: { type: 'string', example: '2024-25' },
  description: 'Season key. Defaults to all seasons.',
};
const formatParam = {
  name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'] },
  description: 'csv returns a downloadable file.',
};
const paging = [
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
  { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
];
const ok = { '200': { description: 'OK' } };

/** GET /api/openapi — machine-readable spec; /api-docs renders it. */
export async function GET() {
  return json({
    openapi: '3.0.3',
    info: {
      title: 'NBA Savant API',
      version: '1.0.0',
      description:
        'Public read-only NBA analytics API. Rate limited to 120 req/min per IP. ' +
        'Every list endpoint supports ?format=csv.',
    },
    servers: [{ url: '/api' }],
    paths: {
      '/seasons': { get: { summary: 'List seasons', responses: ok } },
      '/players': {
        get: {
          summary: 'Search players',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Name substring' },
            { name: 'team', in: 'query', schema: { type: 'string', example: 'GSW' } },
            { name: 'position', in: 'query', schema: { type: 'string', example: 'G' } },
            { name: 'active', in: 'query', schema: { type: 'boolean', default: true } },
            formatParam, ...paging,
          ],
          responses: ok,
        },
      },
      '/players/{id}': {
        get: {
          summary: 'Player profile with career and advanced stats',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { ...ok, '404': { description: 'Player not found' } },
        },
      },
      '/players/{id}/gamelogs': {
        get: {
          summary: 'Game logs for a player',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            seasonParam,
            { name: 'opponent', in: 'query', schema: { type: 'string', example: 'LAL' } },
            { name: 'minPts', in: 'query', schema: { type: 'integer' } },
            formatParam, ...paging,
          ],
          responses: ok,
        },
      },
      '/stats': {
        get: {
          summary: 'Player-season explorer (box score + advanced, sortable)',
          parameters: [
            seasonParam,
            { name: 'team', in: 'query', schema: { type: 'string' } },
            { name: 'position', in: 'query', schema: { type: 'string' } },
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'minGp', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'minMin', in: 'query', schema: { type: 'number' } },
            { name: 'sort', in: 'query', schema: { type: 'string', example: 'tsPct' } },
            { name: 'dir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            formatParam, ...paging,
          ],
          responses: ok,
        },
      },
      '/shots': {
        get: {
          summary: 'Individual shot attempts with coordinates',
          parameters: [
            { name: 'player', in: 'query', schema: { type: 'integer' } },
            { name: 'defender', in: 'query', schema: { type: 'integer' } },
            { name: 'game', in: 'query', schema: { type: 'integer' } },
            { name: 'team', in: 'query', schema: { type: 'string' } },
            seasonParam,
            { name: 'zone', in: 'query', schema: { type: 'string', example: 'Above the Break 3' } },
            { name: 'result', in: 'query', schema: { type: 'string', enum: ['made', 'missed'] } },
            { name: 'minDist', in: 'query', schema: { type: 'integer' } },
            { name: 'maxDist', in: 'query', schema: { type: 'integer' } },
            { name: 'period', in: 'query', schema: { type: 'integer' } },
            formatParam, ...paging,
          ],
          responses: ok,
        },
      },
      '/shots/zones': {
        get: {
          summary: 'Zone efficiency vs. league baseline (heat map source)',
          parameters: [
            { name: 'player', in: 'query', schema: { type: 'integer' } },
            { name: 'team', in: 'query', schema: { type: 'string' } },
            seasonParam,
          ],
          responses: ok,
        },
      },
      '/teams': {
        get: {
          summary: 'Team advanced stats',
          parameters: [
            seasonParam,
            { name: 'conference', in: 'query', schema: { type: 'string', enum: ['East', 'West'] } },
            { name: 'sort', in: 'query', schema: { type: 'string', example: 'netRtg' } },
            formatParam, ...paging,
          ],
          responses: ok,
        },
      },
      '/games': {
        get: {
          summary: 'Games list',
          parameters: [
            seasonParam,
            { name: 'team', in: 'query', schema: { type: 'string' } },
            { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
            formatParam, ...paging,
          ],
          responses: ok,
        },
      },
      '/games/{id}': {
        get: {
          summary: 'Box score and play-by-play',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { ...ok, '404': { description: 'Game not found' } },
        },
      },
      '/leaders': {
        get: {
          summary: 'Leaderboards by stat category',
          parameters: [
            seasonParam,
            { name: 'minGp', in: 'query', schema: { type: 'integer', default: 15 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 5 } },
          ],
          responses: ok,
        },
      },
      '/compare': {
        get: {
          summary: 'Side-by-side comparison for up to 4 players',
          parameters: [
            { name: 'ids', in: 'query', required: true, schema: { type: 'string', example: '201939,2544' } },
            seasonParam,
          ],
          responses: ok,
        },
      },
    },
  });
}
