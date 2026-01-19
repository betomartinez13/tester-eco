import { getConfig } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('SolverClient');

export interface HealthResponse {
  status: 'ok' | 'error';
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string; message?: string }>;
  details?: Record<string, { status: string }>;
}

export interface QuoteV2Request {
  dAppID: string;
  quoteID: string;
  intentExecutionTypes: ('SELF_PUBLISH' | 'GASLESS')[];
  quoteRequest: {
    sourceChainID: number;
    destinationChainID: number;
    sourceToken: string;
    destinationToken: string;
    sourceAmount: string;
    funder: string;
    recipient: string;
  };
}

export interface QuoteV2Fee {
  name: string;
  description: string;
  token: {
    address: string;
    decimals: number;
    symbol: string;
  };
  amount: string;
}

export interface QuoteV2ResponseItem {
  intentExecutionType: string;
  sourceChainID: number;
  destinationChainID: number;
  sourceToken: string;
  destinationToken: string;
  sourceAmount: string;
  destinationAmount: string;
  funder: string;
  refundRecipient: string;
  recipient: string;
  fees: QuoteV2Fee[];
  deadline: number;
  estimatedFulfillTimeSec: number;
  encodedRoute: string;
}

export interface QuoteV2SuccessResponse {
  quoteResponses: QuoteV2ResponseItem[];
  contracts: {
    sourcePortal: string;
    destinationPortal: string;
    prover: string;
  };
}

export interface QuoteV2FailedResponse {
  validations: {
    failed: Array<{
      validation: string;
      reason: string;
    }>;
  };
}

export type QuoteV2Response = QuoteV2SuccessResponse | QuoteV2FailedResponse;

export function isQuoteSuccess(response: QuoteV2Response): response is QuoteV2SuccessResponse {
  return 'quoteResponses' in response;
}

export function isQuoteFailure(response: QuoteV2Response): response is QuoteV2FailedResponse {
  return 'validations' in response;
}

export class SolverClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || getConfig().solverUrl;
  }

  async health(): Promise<HealthResponse> {
    log.debug('Checking solver health');
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json() as Promise<HealthResponse>;
  }

  async healthLive(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health/live`);
    if (!res.ok) throw new Error(`Liveness check failed: ${res.status}`);
    return res.json() as Promise<HealthResponse>;
  }

  async healthReady(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health/ready`);
    if (!res.ok) throw new Error(`Readiness check failed: ${res.status}`);
    return res.json() as Promise<HealthResponse>;
  }

  async getQuote(request: QuoteV2Request): Promise<QuoteV2Response> {
    log.debug({ request }, 'Getting quote');
    const res = await fetch(`${this.baseUrl}/api/v2/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Quote request failed: ${res.status} - ${errorText}`);
    }
    return res.json() as Promise<QuoteV2Response>;
  }

  /**
   * Helper to build a quote request with common defaults
   */
  buildQuoteRequest(params: {
    sourceChainID: number;
    destinationChainID: number;
    sourceToken: string;
    destinationToken: string;
    sourceAmount: string;
    funder: string;
    recipient: string;
  }): QuoteV2Request {
    return {
      dAppID: 'testereco',
      quoteID: `quote-${Date.now()}`,
      intentExecutionTypes: ['SELF_PUBLISH'],
      quoteRequest: {
        sourceChainID: params.sourceChainID,
        destinationChainID: params.destinationChainID,
        sourceToken: params.sourceToken,
        destinationToken: params.destinationToken,
        sourceAmount: params.sourceAmount,
        funder: params.funder,
        recipient: params.recipient,
      },
    };
  }

  /**
   * Get contract addresses for a route from quote response
   */
  async getContractAddresses(
    sourceChainID: number,
    destinationChainID: number,
    walletAddress: string
  ) {
    const request = this.buildQuoteRequest({
      sourceChainID,
      destinationChainID,
      sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC Optimism
      destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC Base
      sourceAmount: '1000000',
      funder: walletAddress,
      recipient: walletAddress,
    });

    const response = await this.getQuote(request);
    if (!isQuoteSuccess(response)) {
      throw new Error(`Failed to get contracts: ${JSON.stringify(response.validations.failed)}`);
    }
    return response.contracts;
  }
}

export function getSolverClient(): SolverClient {
  return new SolverClient();
}
