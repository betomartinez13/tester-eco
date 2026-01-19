import { createPublicClient, http } from 'viem';
import { optimism, base, arbitrum } from 'viem/chains';

const chains = [
  { name: 'Optimism', chain: optimism, rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io' },
  { name: 'Base', chain: base, rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org' },
  { name: 'Arbitrum', chain: arbitrum, rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc' },
];

describe('Chain Connections', () => {
  describe.each(chains)('$name', ({ chain, rpcUrl }) => {
    it('should connect and get block number', async () => {
      const client = createPublicClient({ chain, transport: http(rpcUrl) });
      const blockNumber = await client.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0n);
    });

    it('should get chain ID', async () => {
      const client = createPublicClient({ chain, transport: http(rpcUrl) });
      const chainId = await client.getChainId();
      expect(chainId).toBe(chain.id);
    });
  });
});
