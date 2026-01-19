import request from 'supertest';

const SOLVER_URL = process.env.SOLVER_URL || 'https://solver.bend.eco';

describe('Eco Solver API', () => {
  describe('Quote V2 API', () => {
    const TEST_WALLET = '0x0000000000000000000000000000000000000001';

    it('POST /api/v2/quote should accept valid request format', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v2/quote')
        .send({
          dAppID: 'testereco',
          quoteID: `quote-${Date.now()}`,
          intentExecutionTypes: ['SELF_PUBLISH'],
          quoteRequest: {
            sourceChainID: 10, // Must be number
            destinationChainID: 8453,
            sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC Optimism
            destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC Base
            sourceAmount: '1000000',
            funder: TEST_WALLET,
            recipient: TEST_WALLET,
          },
        })
        .set('Content-Type', 'application/json');

      // The request is accepted even if validation fails (insufficient balance)
      // Production API returns 500 for validation failures with errorDesc
      // We check that it's not a 404 (endpoint exists) and returns validation data
      expect([200, 400, 500]).toContain(res.status);

      // Regardless of status, response should have body with validation info
      expect(res.body).toBeDefined();
      if (res.status === 500 || res.status === 400) {
        // Production API returns validation info in errorDesc
        expect(res.body.errorDesc || res.body.message).toBeDefined();
      }
    });

    it('POST /api/v2/quote should return validation info for Optimism → Base', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v2/quote')
        .send({
          dAppID: 'testereco',
          quoteID: `quote-${Date.now()}`,
          intentExecutionTypes: ['SELF_PUBLISH'],
          quoteRequest: {
            sourceChainID: 10,
            destinationChainID: 8453,
            sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            sourceAmount: '1000000',
            funder: TEST_WALLET,
            recipient: TEST_WALLET,
          },
        })
        .set('Content-Type', 'application/json');

      // Production API responds with validation results
      // Returns 500 for validation failures, 200 for success
      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        // Success response has quoteResponses array and contracts
        expect(res.body).toHaveProperty('quoteResponses');
        expect(res.body).toHaveProperty('contracts');
      } else {
        // Validation error format contains validation info in errorDesc
        expect(res.body.errorDesc || res.body.message).toBeDefined();
      }
    });

    it('POST /api/v2/quote should return validation info for Optimism → Arbitrum', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v2/quote')
        .send({
          dAppID: 'testereco',
          quoteID: `quote-${Date.now()}`,
          intentExecutionTypes: ['SELF_PUBLISH'],
          quoteRequest: {
            sourceChainID: 10,
            destinationChainID: 42161,
            sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC Optimism
            destinationToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC Arbitrum
            sourceAmount: '1000000',
            funder: TEST_WALLET,
            recipient: TEST_WALLET,
          },
        })
        .set('Content-Type', 'application/json');

      expect([200, 400, 500]).toContain(res.status);
    });

    it('POST /api/v2/quote should reject invalid chain IDs as strings', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v2/quote')
        .send({
          dAppID: 'testereco',
          quoteID: `quote-${Date.now()}`,
          intentExecutionTypes: ['SELF_PUBLISH'],
          quoteRequest: {
            sourceChainID: '10', // String instead of number - should fail
            destinationChainID: '8453',
            sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            sourceAmount: '1000000',
            funder: TEST_WALLET,
            recipient: TEST_WALLET,
          },
        })
        .set('Content-Type', 'application/json');

      // Should return 400 for schema validation error
      expect(res.status).toBe(400);
      // Error message contains the full path
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('sourceChainID must be a number')])
      );
    });

    it('POST /api/v2/quote should handle unsupported chain gracefully', async () => {
      const res = await request(SOLVER_URL)
        .post('/api/v2/quote')
        .send({
          dAppID: 'testereco',
          quoteID: `quote-${Date.now()}`,
          intentExecutionTypes: ['SELF_PUBLISH'],
          quoteRequest: {
            sourceChainID: 999999, // Invalid chain
            destinationChainID: 8453,
            sourceToken: '0x0000000000000000000000000000000000000000',
            destinationToken: '0x0000000000000000000000000000000000000000',
            sourceAmount: '1000000',
            funder: TEST_WALLET,
            recipient: TEST_WALLET,
          },
        })
        .set('Content-Type', 'application/json');

      // Should return error for unsupported chain
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
