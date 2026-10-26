import type {
  ControlRequest,
  EngineEvent,
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
  events(limit: number): readonly EngineEvent[];
  portfolio(): PortfolioSnapshot;
  risk(): RiskState;
  control(action: ControlRequest['action'], actor?: string): Promise<void>;
  subscribe(listener: (state: StateResponse) => void): () => void;
  metrics(): string;
}
