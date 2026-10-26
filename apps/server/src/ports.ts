import type {
  ControlRequest,
  EngineHealth,
  MarketDetail,
  PaperSession,
  PortfolioSnapshot,
  RiskState,
  SessionReport,
  Signal,
  StateResponse,
  Trade,
} from '@polyhunter/core';

export interface EnginePort {
  health(): EngineHealth;
  state(): StateResponse;
  marketDetail(tokenId: string): MarketDetail | null;
  trades(limit: number, sessionId?: string): readonly Trade[];
  signals(limit: number, sessionId?: string): readonly Signal[];
  sessions(limit: number): readonly PaperSession[];
  sessionReport(id: string): SessionReport | null;
  portfolio(): PortfolioSnapshot;
  risk(): RiskState;
  control(action: ControlRequest['action']): Promise<void>;
  subscribe(listener: (state: StateResponse) => void): () => void;
  metrics(): string;
}
