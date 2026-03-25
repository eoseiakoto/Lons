import { ScoringModelType, RiskTier, ScoringContext } from '../enums';
import { ITenantScoped } from './common.interface';

export interface IScoringResult extends ITenantScoped {
  id: string;
  customerId: string;
  productId: string;
  modelType: ScoringModelType;
  modelVersion?: string;
  score: string;
  scoreRangeMin: string;
  scoreRangeMax: string;
  probabilityDefault?: string;
  riskTier: RiskTier;
  recommendedLimit?: string;
  contributingFactors?: Record<string, unknown>;
  inputFeatures?: Record<string, unknown>;
  confidence?: string;
  context: ScoringContext;
  createdAt: Date;
}
