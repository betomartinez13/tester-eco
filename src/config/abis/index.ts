import { erc20Abi } from 'viem';

/**
 * Portal ABI - Type-safe ABI containing only the functions and events we use
 * Source: eco-routes Portal contract (0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97 on Optimism)
 */
export const PORTAL_ABI = [
  {
    name: 'publishAndFund',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'destination',
        type: 'uint64',
      },
      {
        name: 'route',
        type: 'bytes',
      },
      {
        name: 'reward',
        type: 'tuple',
        components: [
          {
            name: 'deadline',
            type: 'uint64',
          },
          {
            name: 'creator',
            type: 'address',
          },
          {
            name: 'prover',
            type: 'address',
          },
          {
            name: 'nativeAmount',
            type: 'uint256',
          },
          {
            name: 'tokens',
            type: 'tuple[]',
            components: [
              {
                name: 'token',
                type: 'address',
              },
              {
                name: 'amount',
                type: 'uint256',
              },
            ],
          },
        ],
      },
      {
        name: 'allowPartial',
        type: 'bool',
      },
    ],
    outputs: [
      {
        name: 'intentHash',
        type: 'bytes32',
      },
      {
        name: 'vault',
        type: 'address',
      },
    ],
  },
  {
    name: 'IntentPublished',
    type: 'event',
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'intentHash',
        type: 'bytes32',
      },
      {
        indexed: false,
        name: 'destination',
        type: 'uint64',
      },
      {
        indexed: false,
        name: 'route',
        type: 'bytes',
      },
      {
        indexed: true,
        name: 'creator',
        type: 'address',
      },
      {
        indexed: true,
        name: 'prover',
        type: 'address',
      },
      {
        indexed: false,
        name: 'rewardDeadline',
        type: 'uint64',
      },
      {
        indexed: false,
        name: 'rewardNativeAmount',
        type: 'uint256',
      },
      {
        indexed: false,
        name: 'rewardTokens',
        type: 'tuple[]',
        components: [
          {
            name: 'token',
            type: 'address',
          },
          {
            name: 'amount',
            type: 'uint256',
          },
        ],
      },
    ],
  },
] as const;

export const ERC20_ABI = erc20Abi;
