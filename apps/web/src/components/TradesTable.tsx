import type { MarketView, Trade } from '@polyhunter/core';
import { formatPrice, formatSignedUsd, formatTime, formatUsd } from '@polyhunter/core';
import { EmptyState } from './EmptyState.js';
import { StatusPill } from './StatusPill.js';

function marketName(markets: readonly MarketView[], marketId: string): string {
  return markets.find((view) => view.market.id === marketId)?.market.question ?? marketId;
}

export function TradesTable({
  trades,
  markets,
  limit = 100,
}: {
  trades: readonly Trade[];
  markets: readonly MarketView[];
  limit?: number;
}) {
  if (trades.length === 0) {
    return (
      <EmptyState
        title="No paper fills yet"
        message="Fills are recorded here with price, size, fees and realized PnL. The ledger starts empty on every process restart."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Market</th>
            <th scope="col">Side</th>
            <th scope="col">Price</th>
            <th scope="col">Size</th>
            <th scope="col">Notional</th>
            <th scope="col">Realized</th>
            <th scope="col">Fee</th>
            <th scope="col">Mode</th>
          </tr>
        </thead>
        <tbody>
          {trades.slice(0, limit).map((trade) => (
            <tr key={trade.id}>
              <td className="num">{formatTime(trade.at)}</td>
              <td>
                <span className="market-question">{marketName(markets, trade.marketId)}</span>
              </td>
              <td>
                <StatusPill tone={trade.side === 'BUY' ? 'positive' : 'warning'} dot={false}>
                  {trade.side}
                </StatusPill>
              </td>
              <td className="num">{formatPrice(trade.price)}</td>
              <td className="num">{trade.size.toFixed(2)}</td>
              <td className="num">{formatUsd(trade.notional)}</td>
              <td
                className={`num ${trade.realizedPnl > 0 ? 'is-positive' : trade.realizedPnl < 0 ? 'is-negative' : ''}`}
              >
                {trade.side === 'SELL' ? formatSignedUsd(trade.realizedPnl) : '—'}
              </td>
              <td className="num">{formatUsd(trade.fee)}</td>
              <td>
                <span className="mode-chip">{trade.mode.toUpperCase()}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
