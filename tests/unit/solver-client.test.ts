import {
  SolverClient,
  isQuoteSuccess,
  isQuoteFailure,
  type QuoteV2SuccessResponse,
  type QuoteV2FailedResponse,
} from '../../src/clients/solver-client.js';

describe('SolverClient', () => {
  it('should construct with custom URL', () => {
    const client = new SolverClient('http://test-url:3000');
    expect(client).toBeInstanceOf(SolverClient);
  });

  describe('buildQuoteRequest', () => {
    it('should build valid quote request with defaults', () => {
      const client = new SolverClient('http://test-url:3000');
      const request = client.buildQuoteRequest({
        sourceChainID: 10,
        destinationChainID: 8453,
        sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        sourceAmount: '1000000',
        funder: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000001',
      });

      expect(request.dAppID).toBe('testereco');
      expect(request.quoteID).toMatch(/^quote-\d+$/);
      expect(request.intentExecutionTypes).toEqual(['SELF_PUBLISH']);
      expect(request.quoteRequest.sourceChainID).toBe(10);
      expect(request.quoteRequest.destinationChainID).toBe(8453);
    });
  });

  describe('type guards', () => {
    it('isQuoteSuccess should return true for success response', () => {
      const successResponse: QuoteV2SuccessResponse = {
        quoteResponses: [{
          intentExecutionType: 'SELF_PUBLISH',
          sourceChainID: 10,
          destinationChainID: 8453,
          sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
          destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          sourceAmount: '1000000',
          destinationAmount: '990000',
          funder: '0x0000000000000000000000000000000000000001',
          refundRecipient: '0x0000000000000000000000000000000000000001',
          recipient: '0x0000000000000000000000000000000000000001',
          fees: [],
          deadline: 1735689600,
          estimatedFulfillTimeSec: 300,
          encodedRoute: '0x',
        }],
        contracts: {
          sourcePortal: '0x1234567890123456789012345678901234567890',
          destinationPortal: '0x1234567890123456789012345678901234567891',
          prover: '0x1234567890123456789012345678901234567892',
        },
      };

      expect(isQuoteSuccess(successResponse)).toBe(true);
      expect(isQuoteFailure(successResponse)).toBe(false);
    });

    it('isQuoteFailure should return true for failed response', () => {
      const failedResponse: QuoteV2FailedResponse = {
        validations: {
          failed: [
            { validation: 'funding', reason: 'Insufficient balance' },
          ],
        },
      };

      expect(isQuoteFailure(failedResponse)).toBe(true);
      expect(isQuoteSuccess(failedResponse)).toBe(false);
    });
  });
});
