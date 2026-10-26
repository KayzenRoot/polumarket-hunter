export const OPENAPI_PATH = '/openapi.json';

const ref = (name: string): { $ref: string } => ({ $ref: `#/components/schemas/${name}` });

const envelope = (data: unknown): unknown => ({
  allOf: [
    ref('OkEnvelope'),
    {
      type: 'object',
      required: ['data'],
      properties: { data },
    },
  ],
});

const errorResponse = (description: string): unknown => ({
  description,
  content: {
    'application/json': {
      schema: ref('Failure'),
    },
  },
});

const okResponse = (description: string, data: unknown): unknown => ({
  description,
  content: {
    'application/json': {
      schema: envelope(data),
    },
  },
});

const queryLimit = {
  name: 'limit',
  in: 'query' as const,
  required: false,
  schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
};

const querySession = {
  name: 'session',
  in: 'query' as const,
  required: false,
  schema: { type: 'string', minLength: 1, maxLength: 128 },
};

const pathParameter = (name: string): unknown => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
});

export const OPENAPI_DOCUMENT = {
  openapi: '3.0.3',
  info: {
    title: 'PolyHunter API',
    version: '0.1.0',
    description:
      'Local, single-user, paper-first prediction-market research terminal. No live order endpoint, no wallet and no geoblock bypass. Responses use the {ok, data} or {ok, error} envelope.',
  },
  servers: [{ url: 'http://127.0.0.1:8787', description: 'Default loopback server' }],
  tags: [
    { name: 'health', description: 'Liveness, provider and geoblock state' },
    { name: 'state', description: 'Dashboard state and event stream' },
    { name: 'markets', description: 'Scanned markets and order books' },
    { name: 'sessions', description: 'Paper sessions and reports' },
    { name: 'portfolio', description: 'Paper portfolio and risk' },
    { name: 'control', description: 'Operator controls' },
    { name: 'observability', description: 'Metrics and the OpenAPI contract' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['health'],
        summary: 'Engine health',
        responses: {
          '200': okResponse('Engine, provider and geoblock state', ref('Health')),
        },
      },
    },
    '/api/state': {
      get: {
        tags: ['state'],
        summary: 'Full dashboard state',
        responses: {
          '200': okResponse('Current paper state', ref('State')),
        },
      },
    },
    '/api/stream': {
      get: {
        tags: ['state'],
        summary: 'Server-sent state stream',
        description:
          'Emits `event: state` messages with a JSON state payload and a keep-alive comment every 15 seconds.',
        responses: {
          '200': {
            description: 'SSE stream',
            content: {
              'text/event-stream': { schema: { type: 'string' } },
            },
          },
        },
      },
    },
    '/api/sessions': {
      get: {
        tags: ['sessions'],
        summary: 'Recent paper sessions',
        responses: {
          '200': okResponse('Recent sessions', {
            type: 'array',
            items: ref('Session'),
          }),
        },
      },
    },
    '/api/events': {
      get: {
        tags: ['state'],
        summary: 'Recent engine events',
        parameters: [queryLimit],
        responses: {
          '200': okResponse('Recent events', {
            type: 'array',
            items: ref('Event'),
          }),
          '400': errorResponse('Invalid query'),
        },
      },
    },
    '/api/sessions/{sessionId}/report': {
      get: {
        tags: ['sessions'],
        summary: 'Session report',
        parameters: [pathParameter('sessionId')],
        responses: {
          '200': okResponse('Session report', ref('SessionReport')),
          '400': errorResponse('Invalid session id'),
          '404': errorResponse('Session not found'),
        },
      },
    },
    '/api/sessions/{sessionId}/report.csv': {
      get: {
        tags: ['sessions'],
        summary: 'Session report as CSV',
        parameters: [pathParameter('sessionId')],
        responses: {
          '200': {
            description: 'CSV attachment',
            content: {
              'text/csv': { schema: { type: 'string' } },
            },
          },
          '400': errorResponse('Invalid session id'),
          '404': errorResponse('Session not found'),
        },
      },
    },
    '/api/markets': {
      get: {
        tags: ['markets'],
        summary: 'Scanned markets',
        responses: {
          '200': okResponse('Market views', {
            type: 'array',
            items: ref('MarketView'),
          }),
        },
      },
    },
    '/api/markets/{tokenId}': {
      get: {
        tags: ['markets'],
        summary: 'Market detail and order book',
        parameters: [pathParameter('tokenId')],
        responses: {
          '200': okResponse('Market detail', ref('MarketDetail')),
          '400': errorResponse('Invalid token id'),
          '404': errorResponse('Market not found'),
        },
      },
    },
    '/api/portfolio': {
      get: {
        tags: ['portfolio'],
        summary: 'Paper portfolio',
        responses: {
          '200': okResponse('Portfolio snapshot', ref('Portfolio')),
        },
      },
    },
    '/api/risk': {
      get: {
        tags: ['portfolio'],
        summary: 'Risk state',
        responses: {
          '200': okResponse('Risk state', ref('RiskState')),
        },
      },
    },
    '/api/trades': {
      get: {
        tags: ['portfolio'],
        summary: 'Paper fills',
        parameters: [queryLimit, querySession],
        responses: {
          '200': okResponse('Paper fills', {
            type: 'array',
            items: ref('Trade'),
          }),
          '400': errorResponse('Invalid query'),
        },
      },
    },
    '/api/signals': {
      get: {
        tags: ['portfolio'],
        summary: 'Strategy signals',
        parameters: [queryLimit, querySession],
        responses: {
          '200': okResponse('Signals', {
            type: 'array',
            items: ref('Signal'),
          }),
          '400': errorResponse('Invalid query'),
        },
      },
    },
    '/api/control': {
      post: {
        tags: ['control'],
        summary: 'Operate the paper engine',
        description:
          'Requires the `x-api-token` header only when the server was started with API_TOKEN. Rate-limited to 10 requests per minute.',
        security: [{}, { ApiToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: ref('ControlRequest'),
            },
          },
        },
        responses: {
          '200': okResponse('Control accepted; returns the new state', ref('State')),
          '400': errorResponse('Invalid control action'),
          '401': errorResponse('Missing or invalid API token'),
          '409': errorResponse('Control rejected by the engine'),
        },
      },
    },
    '/metrics': {
      get: {
        tags: ['observability'],
        summary: 'Prometheus metrics',
        responses: {
          '200': {
            description: 'Prometheus text exposition',
            content: {
              'text/plain': { schema: { type: 'string' } },
            },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['observability'],
        summary: 'This OpenAPI document',
        responses: {
          '200': {
            description: 'OpenAPI 3.0.3 document',
            content: {
              'application/json': { schema: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    '/': {
      get: {
        tags: ['observability'],
        summary: 'Dashboard shell',
        description:
          'Serves the built React dashboard, or an API-only fallback when the build is absent.',
        responses: {
          '200': {
            description: 'HTML dashboard or fallback text',
            content: {
              'text/html': { schema: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiToken: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-token',
        description: 'Required only when API_TOKEN is configured on the server.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
        },
      },
      Failure: {
        type: 'object',
        required: ['ok', 'error'],
        properties: {
          ok: { type: 'boolean', enum: [false] },
          error: ref('Error'),
        },
      },
      OkEnvelope: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean', enum: [true] },
          data: { type: 'object' },
        },
      },
      Provider: {
        type: 'object',
        required: ['name', 'connected', 'lastMessageAt', 'reconnectCount', 'error'],
        properties: {
          name: { type: 'string' },
          connected: { type: 'boolean' },
          lastMessageAt: { type: 'integer', nullable: true },
          reconnectCount: { type: 'integer' },
          error: { type: 'string', nullable: true },
        },
      },
      Geoblock: {
        type: 'object',
        required: ['status', 'blocked', 'country', 'region', 'checkedAt', 'reason'],
        properties: {
          status: { type: 'string', enum: ['ELIGIBLE', 'BLOCKED', 'UNKNOWN'] },
          blocked: { type: 'boolean', nullable: true },
          country: { type: 'string', nullable: true },
          region: { type: 'string', nullable: true },
          checkedAt: { type: 'integer', nullable: true },
          reason: { type: 'string', nullable: true },
        },
      },
      Health: {
        type: 'object',
        required: [
          'status',
          'mode',
          'liveAuthorized',
          'liveAllowed',
          'liveBlockReason',
          'startedAt',
          'uptimeMs',
          'markets',
          'subscriptions',
          'books',
          'lastBookAt',
          'provider',
          'geoblock',
          'killReason',
        ],
        properties: {
          status: {
            type: 'string',
            enum: ['starting', 'running', 'paused', 'stopped', 'killed', 'error'],
          },
          mode: { type: 'string', enum: ['paper', 'live'] },
          liveAuthorized: { type: 'boolean' },
          liveAllowed: { type: 'boolean' },
          liveBlockReason: { type: 'string', nullable: true },
          startedAt: { type: 'integer', nullable: true },
          uptimeMs: { type: 'integer' },
          markets: { type: 'integer' },
          subscriptions: { type: 'integer' },
          books: { type: 'integer' },
          lastBookAt: { type: 'integer', nullable: true },
          provider: ref('Provider'),
          geoblock: ref('Geoblock'),
          killReason: { type: 'string', nullable: true },
        },
      },
      Session: {
        type: 'object',
        required: [
          'id',
          'startedAt',
          'endedAt',
          'status',
          'mode',
          'startingCash',
          'endingEquity',
          'stopReason',
        ],
        properties: {
          id: { type: 'string' },
          startedAt: { type: 'integer' },
          endedAt: { type: 'integer', nullable: true },
          status: { type: 'string', enum: ['running', 'stopped', 'killed', 'error'] },
          mode: { type: 'string', enum: ['paper', 'live'] },
          startingCash: { type: 'number' },
          endingEquity: { type: 'number', nullable: true },
          stopReason: { type: 'string', nullable: true },
        },
      },
      FeeSchedule: {
        type: 'object',
        required: ['rate', 'exponent', 'takerOnly', 'rebateRate'],
        properties: {
          rate: { type: 'number' },
          exponent: { type: 'number' },
          takerOnly: { type: 'boolean' },
          rebateRate: { type: 'number', nullable: true },
        },
      },
      Market: {
        type: 'object',
        required: [
          'id',
          'conditionId',
          'slug',
          'question',
          'endDate',
          'liquidity',
          'volume24h',
          'yesTokenId',
          'noTokenId',
          'tickSize',
          'negRisk',
          'active',
          'closed',
          'acceptingOrders',
        ],
        properties: {
          id: { type: 'string' },
          conditionId: { type: 'string' },
          slug: { type: 'string' },
          question: { type: 'string' },
          endDate: { type: 'string', nullable: true },
          liquidity: { type: 'number' },
          volume24h: { type: 'number' },
          yesTokenId: { type: 'string' },
          noTokenId: { type: 'string' },
          tickSize: { type: 'number' },
          negRisk: { type: 'boolean' },
          active: { type: 'boolean' },
          closed: { type: 'boolean' },
          acceptingOrders: { type: 'boolean' },
          feesEnabled: { type: 'boolean', nullable: true },
          feeSchedule: { allOf: [ref('FeeSchedule')], nullable: true },
        },
      },
      BookLevel: {
        type: 'object',
        required: ['price', 'size'],
        properties: {
          price: { type: 'number' },
          size: { type: 'number' },
        },
      },
      OrderBook: {
        type: 'object',
        required: [
          'tokenId',
          'marketId',
          'outcome',
          'tickSize',
          'timestamp',
          'bids',
          'asks',
          'lastTradePrice',
          'hash',
        ],
        properties: {
          tokenId: { type: 'string' },
          marketId: { type: 'string' },
          outcome: { type: 'string', enum: ['YES', 'NO'] },
          tickSize: { type: 'number' },
          timestamp: { type: 'integer' },
          bids: { type: 'array', items: ref('BookLevel') },
          asks: { type: 'array', items: ref('BookLevel') },
          lastTradePrice: { type: 'number', nullable: true },
          hash: { type: 'string', nullable: true },
        },
      },
      TopOfBook: {
        type: 'object',
        required: ['bid', 'ask', 'bidSize', 'askSize', 'mid', 'microprice', 'spread', 'crossed'],
        properties: {
          bid: { type: 'number' },
          ask: { type: 'number' },
          bidSize: { type: 'number' },
          askSize: { type: 'number' },
          mid: { type: 'number' },
          microprice: { type: 'number' },
          spread: { type: 'number' },
          crossed: { type: 'boolean' },
        },
      },
      Position: {
        type: 'object',
        required: ['marketId', 'tokenId', 'outcome', 'shares', 'avgPrice', 'openedAt', 'updatedAt'],
        properties: {
          marketId: { type: 'string' },
          tokenId: { type: 'string' },
          outcome: { type: 'string', enum: ['YES', 'NO'] },
          shares: { type: 'number' },
          avgPrice: { type: 'number' },
          openedAt: { type: 'integer' },
          updatedAt: { type: 'integer' },
        },
      },
      StrategyIntent: {
        type: 'object',
        required: [
          'action',
          'tokenId',
          'marketId',
          'outcome',
          'price',
          'size',
          'fairValue',
          'edge',
          'confidence',
          'reasons',
          'createdAt',
        ],
        properties: {
          action: {
            type: 'string',
            enum: ['HOLD', 'PLACE_BID', 'PLACE_ASK', 'TAKE_BUY', 'TAKE_SELL'],
          },
          tokenId: { type: 'string' },
          marketId: { type: 'string' },
          outcome: { type: 'string', enum: ['YES', 'NO'] },
          price: { type: 'number' },
          size: { type: 'number' },
          fairValue: { type: 'number' },
          edge: { type: 'number' },
          confidence: { type: 'number' },
          reasons: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'integer' },
        },
      },
      MarketView: {
        type: 'object',
        required: ['market', 'book', 'decision', 'position', 'score', 'bookAgeMs'],
        properties: {
          market: ref('Market'),
          book: { allOf: [ref('TopOfBook')], nullable: true },
          decision: { allOf: [ref('StrategyIntent')], nullable: true },
          position: { allOf: [ref('Position')], nullable: true },
          score: { type: 'number' },
          bookAgeMs: { type: 'integer', nullable: true },
        },
      },
      MarketDetail: {
        type: 'object',
        required: ['market', 'book', 'decision', 'position', 'score'],
        properties: {
          market: ref('Market'),
          book: { allOf: [ref('OrderBook')], nullable: true },
          decision: { allOf: [ref('StrategyIntent')], nullable: true },
          position: { allOf: [ref('Position')], nullable: true },
          score: { type: 'number' },
        },
      },
      Portfolio: {
        type: 'object',
        required: [
          'startingCash',
          'cash',
          'reservedCash',
          'equity',
          'exposure',
          'realizedPnl',
          'unrealizedPnl',
          'totalPnl',
          'positions',
          'openOrders',
          'updatedAt',
        ],
        properties: {
          startingCash: { type: 'number' },
          cash: { type: 'number' },
          reservedCash: { type: 'number' },
          equity: { type: 'number' },
          exposure: { type: 'number' },
          realizedPnl: { type: 'number' },
          unrealizedPnl: { type: 'number' },
          totalPnl: { type: 'number' },
          positions: { type: 'array', items: ref('Position') },
          openOrders: { type: 'integer' },
          updatedAt: { type: 'integer' },
        },
      },
      RiskLimits: {
        type: 'object',
        required: [
          'maxNotionalPerMarket',
          'maxTotalNotional',
          'maxOpenPositions',
          'maxDailyLoss',
          'maxDrawdownPct',
          'maxOrdersPerMinute',
          'maxBookAgeMs',
          'maxSpread',
          'minDepthShares',
        ],
        properties: {
          maxNotionalPerMarket: { type: 'number' },
          maxTotalNotional: { type: 'number' },
          maxOpenPositions: { type: 'integer' },
          maxDailyLoss: { type: 'number' },
          maxDrawdownPct: { type: 'number' },
          maxOrdersPerMinute: { type: 'integer' },
          maxBookAgeMs: { type: 'integer' },
          maxSpread: { type: 'number' },
          minDepthShares: { type: 'number' },
        },
      },
      RiskCheck: {
        type: 'object',
        required: ['name', 'ok', 'detail'],
        properties: {
          name: { type: 'string' },
          ok: { type: 'boolean' },
          detail: { type: 'string' },
        },
      },
      RiskState: {
        type: 'object',
        required: [
          'killSwitch',
          'dailyPnl',
          'peakEquity',
          'drawdownPct',
          'exposure',
          'openPositions',
          'ordersLastMinute',
          'limits',
          'checks',
        ],
        properties: {
          killSwitch: { type: 'boolean' },
          dailyPnl: { type: 'number' },
          peakEquity: { type: 'number' },
          drawdownPct: { type: 'number' },
          exposure: { type: 'number' },
          openPositions: { type: 'integer' },
          ordersLastMinute: { type: 'integer' },
          limits: ref('RiskLimits'),
          checks: { type: 'array', items: ref('RiskCheck') },
        },
      },
      Trade: {
        type: 'object',
        required: [
          'id',
          'at',
          'marketId',
          'tokenId',
          'outcome',
          'side',
          'price',
          'size',
          'notional',
          'fee',
          'realizedPnl',
          'orderId',
          'mode',
        ],
        properties: {
          id: { type: 'string' },
          at: { type: 'integer' },
          marketId: { type: 'string' },
          tokenId: { type: 'string' },
          outcome: { type: 'string', enum: ['YES', 'NO'] },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          price: { type: 'number' },
          size: { type: 'number' },
          notional: { type: 'number' },
          fee: { type: 'number' },
          realizedPnl: { type: 'number' },
          orderId: { type: 'string' },
          mode: { type: 'string', enum: ['paper', 'live'] },
        },
      },
      Signal: {
        type: 'object',
        required: [
          'id',
          'at',
          'marketId',
          'tokenId',
          'outcome',
          'action',
          'fairValue',
          'marketPrice',
          'edge',
          'confidence',
          'accepted',
          'reasons',
        ],
        properties: {
          id: { type: 'string' },
          at: { type: 'integer' },
          marketId: { type: 'string' },
          tokenId: { type: 'string' },
          outcome: { type: 'string', enum: ['YES', 'NO'] },
          action: {
            type: 'string',
            enum: ['HOLD', 'PLACE_BID', 'PLACE_ASK', 'TAKE_BUY', 'TAKE_SELL'],
          },
          fairValue: { type: 'number' },
          marketPrice: { type: 'number' },
          edge: { type: 'number' },
          confidence: { type: 'number' },
          accepted: { type: 'boolean' },
          reasons: { type: 'array', items: { type: 'string' } },
        },
      },
      Event: {
        type: 'object',
        required: ['at', 'kind', 'severity', 'message', 'details'],
        properties: {
          at: { type: 'integer' },
          kind: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warn', 'error'] },
          message: { type: 'string' },
          details: { type: 'string', nullable: true },
        },
      },
      FeedHealth: {
        type: 'object',
        additionalProperties: true,
        properties: {
          lastBookAt: { type: 'integer', nullable: true },
          ageMs: { type: 'integer', nullable: true },
          bookStaleMs: { type: 'integer' },
          messageGaps: { type: 'integer' },
          stalePeriods: { type: 'integer' },
        },
      },
      EquityPoint: {
        type: 'object',
        required: ['at', 'equity', 'exposure'],
        properties: {
          at: { type: 'integer' },
          equity: { type: 'number' },
          exposure: { type: 'number' },
        },
      },
      SessionReportMetrics: {
        type: 'object',
        additionalProperties: true,
        properties: {
          incomplete: { type: 'boolean' },
          startingCash: { type: 'number' },
          endingEquity: { type: 'number' },
          totalReturnPct: { type: 'number' },
          realizedPnl: { type: 'number' },
          unrealizedPnl: { type: 'number' },
          totalPnl: { type: 'number' },
          fees: { type: 'number' },
          trades: { type: 'integer' },
          wins: { type: 'integer' },
          losses: { type: 'integer' },
          winRate: { type: 'number' },
          signals: { type: 'integer' },
          acceptedSignals: { type: 'integer' },
          rejectedSignals: { type: 'integer' },
        },
      },
      SessionReportRejection: {
        type: 'object',
        required: ['at', 'marketId', 'tokenId', 'action', 'reasons'],
        properties: {
          at: { type: 'integer' },
          marketId: { type: 'string' },
          tokenId: { type: 'string' },
          action: {
            type: 'string',
            enum: ['HOLD', 'PLACE_BID', 'PLACE_ASK', 'TAKE_BUY', 'TAKE_SELL'],
          },
          reasons: { type: 'array', items: { type: 'string' } },
        },
      },
      SessionReport: {
        type: 'object',
        required: ['session', 'metrics', 'equityCurve', 'trades', 'signals', 'rejections'],
        properties: {
          session: ref('Session'),
          metrics: ref('SessionReportMetrics'),
          equityCurve: { type: 'array', items: ref('EquityPoint') },
          trades: { type: 'array', items: ref('Trade') },
          signals: { type: 'array', items: ref('Signal') },
          rejections: { type: 'array', items: ref('SessionReportRejection') },
        },
      },
      State: {
        type: 'object',
        additionalProperties: true,
        required: [
          'health',
          'session',
          'sessions',
          'feedHealth',
          'events',
          'markets',
          'portfolio',
          'trades',
          'signals',
          'risk',
          'config',
          'equityCurve',
        ],
        properties: {
          health: ref('Health'),
          session: { allOf: [ref('Session')], nullable: true },
          sessions: { type: 'array', items: ref('Session') },
          feedHealth: ref('FeedHealth'),
          events: { type: 'array', items: ref('Event') },
          markets: { type: 'array', items: ref('MarketView') },
          portfolio: ref('Portfolio'),
          trades: { type: 'array', items: ref('Trade') },
          signals: { type: 'array', items: ref('Signal') },
          risk: ref('RiskState'),
          config: { type: 'object', additionalProperties: true },
          equityCurve: { type: 'array', items: ref('EquityPoint') },
        },
      },
      ControlRequest: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: [
              'start',
              'stop',
              'pause',
              'resume',
              'cancel-all',
              'flatten',
              'kill',
              'reset-kill',
            ],
          },
          actor: { type: 'string', minLength: 1, maxLength: 64 },
        },
      },
    },
  },
} as const;
