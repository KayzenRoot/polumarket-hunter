import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('server configuration', () => {
  it('loads safe defaults for local paper trading', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8787);
    expect(config.tradingMode).toBe('paper');
    expect(config.liveAuthorized).toBe(false);
    expect(config.strategy).toBe('micro-maker');
    expect(config.strategyConfig.minEdge).toBe(0.006);
    expect(config.riskLimits.maxTotalNotional).toBe(100);
    expect(config.apiToken).toBeNull();
  });

  it('parses strings, booleans and numbers from env', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      PORT: '9000',
      DEMO_MODE: 'true',
      RECORD_BOOKS: '1',
      MAX_MARKETS: '7',
      STARTING_CASH: '250.50',
      MIN_EDGE: '0.01',
      STRATEGY: 'momentum-taker',
    });
    expect(config.port).toBe(9000);
    expect(config.demoMode).toBe(true);
    expect(config.recordBooks).toBe(true);
    expect(config.maxMarkets).toBe(7);
    expect(config.startingCash).toBe(250.5);
    expect(config.strategyConfig.minEdge).toBe(0.01);
    expect(config.strategy).toBe('momentum-taker');
  });

  it('accepts the maker-scalper research strategy', () => {
    const config = loadConfig({ NODE_ENV: 'test', STRATEGY: 'maker-scalper' });
    expect(config.strategy).toBe('maker-scalper');
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: '70000' })).toThrow(
      /invalid PolyHunter configuration/,
    );
  });

  it('rejects an invalid strategy', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', STRATEGY: 'yolo' })).toThrow(
      /invalid PolyHunter configuration/,
    );
  });

  it('refuses a non-loopback host without an API token', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', HOST: '0.0.0.0' })).toThrow(
      /non-loopback host without API_TOKEN/,
    );
  });

  it('allows a non-loopback host when an API token is set', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      HOST: '0.0.0.0',
      API_TOKEN: 'secret-token',
    });
    expect(config.apiToken).toBe('secret-token');
  });

  it('refuses live mode without explicit authorization', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', TRADING_MODE: 'live' })).toThrow(
      /LIVE_TRADING_AUTHORIZED/,
    );
  });

  it('allows live mode only past the authorization check', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      TRADING_MODE: 'live',
      LIVE_TRADING_AUTHORIZED: 'true',
    });
    expect(config.tradingMode).toBe('live');
    expect(config.liveAuthorized).toBe(true);
  });

  it('loads feed watchdog and webhook settings', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      FEED_STALE_MS: '15000',
      ALERT_WEBHOOK_URL: 'https://alerts.example.test/polyhunter',
    });
    expect(config.feedStaleMs).toBe(15_000);
    expect(config.alertWebhookUrl).toBe('https://alerts.example.test/polyhunter');

    const defaults = loadConfig({ NODE_ENV: 'test' });
    expect(defaults.feedStaleMs).toBe(60_000);
    expect(defaults.alertWebhookUrl).toBeNull();
    expect(defaults.retentionDays).toBe(30);
    expect(defaults.recordingRetentionDays).toBe(30);

    expect(() =>
      loadConfig({ NODE_ENV: 'test', ALERT_WEBHOOK_URL: 'ftp://alerts.example.test' }),
    ).toThrow(/invalid PolyHunter configuration/);
  });

  it('keeps strategy and risk spread limits aligned', () => {
    const config = loadConfig({ NODE_ENV: 'test', MAX_SPREAD: '0.02', BOOK_STALE_MS: '3000' });
    expect(config.strategyConfig.maxSpread).toBe(0.02);
    expect(config.riskLimits.maxSpread).toBe(0.02);
    expect(config.strategyConfig.maxBookAgeMs).toBe(3000);
    expect(config.riskLimits.maxBookAgeMs).toBe(3000);
  });
});
