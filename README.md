# NftCollection — ERC-721 NFT Smart Contract

A production-ready, fully ERC-721 compatible NFT smart contract with minting controls, burning, pausable minting, metadata, and comprehensive automated tests — all containerized with Docker.

## Features

| Feature | Description |
|---|---|
| **ERC-721 Core** | `balanceOf`, `ownerOf`, `transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll` |
| **ERC-165** | `supportsInterface` for IERC721, IERC721Metadata, IERC165 |
| **Safe Minting** | Admin-only `safeMint` with max supply enforcement, valid tokenId range (1–maxSupply), double-mint prevention |
| **Burning** | Token owners can burn their tokens; updates balances, supply, and clears approvals |
| **Metadata** | `tokenURI` via base URI + tokenId concatenation; admin-updatable base URI |
| **Pause/Unpause** | Admin can pause and unpause minting |
| **Access Control** | Single owner pattern with `transferOwnership`; admin-only minting and configuration |
| **Custom Errors** | Gas-efficient custom errors instead of string reverts |
| **Safe Transfers** | Checks-effects-interactions pattern; IERC721Receiver validation for contract recipients |

## Project Structure

```
├── contracts/
│   ├── NftCollection.sol          # Main ERC-721 NFT contract
│   └── mocks/
│       └── MockReceivers.sol      # Test helper contracts for safe transfers
├── test/
│   └── NftCollection.test.js      # Comprehensive test suite (65+ tests)
├── hardhat.config.js              # Hardhat configuration (Solidity 0.8.20, optimizer)
├── package.json                   # Node.js dependencies
├── Dockerfile                     # Containerized build & test environment
├── .dockerignore                  # Docker build context exclusions
└── README.md                      # This file
```

## Contract Configuration

| Parameter | Value |
|---|---|
| **Solidity Version** | 0.8.20 |
| **Token ID Range** | 1 to maxSupply (inclusive) |
| **Max Supply** | Set at deployment (immutable) |
| **Access Control** | Single owner (deployer) |
| **Metadata** | Base URI + tokenId string concatenation |

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Docker** (for containerized testing)

### Local Development

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run the full test suite
npx hardhat test
```

### Docker (Recommended for Evaluation)

```bash
# Build the Docker image
docker build -t nft-contract .

# Run all tests in the container
docker run --rm nft-contract
```

The Docker container:
- Uses `node:18-alpine` as the base image
- Installs all dependencies and compiles contracts during build
- Runs `npx hardhat test` as the default command
- Requires **no external network access** or manual intervention
- Produces clear pass/fail output with gas usage reports

## Test Coverage

The test suite contains **65+ test cases** organized by behavior:

| Group | Tests |
|---|---|
| Deployment & Configuration | Name, symbol, maxSupply, totalSupply, owner, baseURI, minting paused state |
| Minting | Success, double-mint, max supply, zero address, non-admin, invalid tokenId, boundary IDs, receiver checks |
| Transfers (transferFrom) | By owner, by approved, by operator, unauthorized, non-existent, zero address, wrong from, self-transfer, balance updates, event emission |
| Safe Transfers | EOA, valid receiver, non-receiver, bad receiver, data forwarding |
| Approvals (Single Token) | Set, event, revoke, re-approve, owner approval revert, unauthorized, operator-set |
| Operator Approvals | Set, revoke, events, self-operator revert, zero address, multi-token transfer, post-revoke revert |
| Metadata & Token URI | Correct URI, non-existent revert, base URI update, event, non-admin revert |
| Burning | Owner burn, non-owner revert, balance/supply updates, event, approval cleared, tokenURI revert |
| Pause/Unpause | Admin pause/unpause, events, mint blocked, mint after unpause, non-admin reverts |
| Access Control | Transfer ownership, events, new owner mints, old owner reverts, non-owner revert, zero address |
| ERC-165 | IERC165, IERC721, IERC721Metadata support; random interface rejection |
| Edge Cases | Approve then burn, sequential transfers, balanceOf(zero), state consistency, revoked approval |
| Gas Usage | Mint+transfer under 300k gas, approve+transfer under 200k gas |

## Gas Efficiency

The contract minimizes gas costs through:
- **Custom errors** instead of string reverts
- **Optimizer** enabled with 200 runs
- **Minimal storage writes** — only essential state updates
- **Mapping-based lookups** — O(1) for ownership, balances, approvals

## Security Considerations

- **Checks-Effects-Interactions**: Safe transfer callbacks are invoked AFTER all state changes
- **Atomic State Changes**: Transfers update ownership, balances, and approvals in a single transaction
- **Input Validation**: All functions validate addresses, tokenIds, and authorization before state mutations
- **Custom Errors**: Clear, specific error types for every failure mode
- **Access Control**: Centralized `onlyOwner` modifier for admin operations