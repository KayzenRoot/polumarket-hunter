import type {
  ControlRequest,
  EngineHealth,
  MarketDetail,
  PortfolioSnapshot,
  RiskState,
  Signal,
  StateResponse,
  Trade,
} from '@polyhunter/core';

export interface EnginePort {
  health(): EngineHealth;
  state(): StateResponse;
  marketDetail(tokenId: string): MarketDetail | null;
  trades(limit: number): readonly Trade[];
  signals(limit: number): readonly Signal[];
  portfolio(): PortfolioSnapshot;
  risk(): RiskState;
  control(action: ControlRequest['action']): Promise<void>;
  subscribe(listener: (state: StateResponse) => void): () => void;
  metrics(): string;
}
