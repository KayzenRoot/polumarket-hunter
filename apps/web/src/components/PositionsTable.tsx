import type { MarketView, PortfolioSnapshot, Position } from '@polyhunter/core';
import { formatDateTime, formatPrice, formatSignedUsd, formatUsd } from '@polyhunter/core';
import { EmptyState } from './EmptyState.js';

function marketName(markets: readonly MarketView[], marketId: string): string {
  return markets.find((view) => view.market.id === marketId)?.market.question ?? marketId;
}

function markFor(markets: readonly MarketView[], position: Position): number {
  const view = markets.find((candidate) => candidate.market.id === position.marketId);
  return view?.book?.microprice ?? view?.book?.mid ?? position.avgPrice;
}

export function PositionsTable({
  positions,
  markets,
  portfolio,
}: {
  positions: readonly Position[];
  markets: readonly MarketView[];
  portfolio: PortfolioSnapshot;
}) {
  if (positions.length === 0) {
    return (
      <EmptyState
        title="No open paper positions"
        message="The strategy is flat. Maker quotes only fill when the book crosses the resting order."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Market</th>
            <th scope="col">Outcome</th>
            <th scope="col">Shares</th>
            <th scope="col">Avg</th>
            <th scope="col">Mark</th>
            <th scope="col">Value</th>
            <th scope="col">Unrealized</th>
            <th scope="col">Opened</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const mark = markFor(markets, position);
            const value = mark * position.shares;
            const pnl = (mark - position.avgPrice) * position.shares;
            return (
              <tr key={position.tokenId}>
                <td>
                  <span className="market-question">{marketName(markets, position.marketId)}</span>
                </td>
                <td>
                  <span className={`outcome-chip outcome-${position.outcome.toLowerCase()}`}>
                    {position.outcome}
                  </span>
                </td>
                <td className="num">{position.shares.toFixed(2)}</td>
                <td className="num">{formatPrice(position.avgPrice)}</td>
                <td className="num">{formatPrice(mark)}</td>
                <td className="num">{formatUsd(value)}</td>
                <td className={`num ${pnl >= 0 ? 'is-positive' : 'is-negative'}`}>
                  {formatSignedUsd(pnl)}
                </td>
                <td className="muted">{formatDateTime(position.openedAt)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Portfolio</td>
            <td className="num">{formatUsd(portfolio.exposure)}</td>
            <td className={`num ${portfolio.unrealizedPnl >= 0 ? 'is-positive' : 'is-negative'}`}>
              {formatSignedUsd(portfolio.unrealizedPnl)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
