// contracts/State.sol
// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

import "./Structs.sol";

contract XBurnMintERC20Events {
    event bridgeInEvent(
        uint256 tokenAmount,
        uint256 fromChain,
        uint256 toChain,
        bytes32 indexed toAddress
    );

    event bridgeOutEvent(
        uint256 tokenAmount,
        uint256 fromChain,
        uint256 toChain,
        bytes32 indexed fromAddress,
        bytes32 indexed toAddress
    );
}

contract XBurnMintERC20Storage {
    struct Provider {
        uint16 chainId;
        // Required number of block confirmations to assume finality
        uint8 finality;
    }

    struct State {
        Provider provider;
        address payable wormhole;
        // Mapping of consumed token transfers
        mapping(bytes32 => bool) completedTransfers;
        // Mapping of token contracts on other chains
        mapping(uint16 => bytes32) tokenImplementations;
        // EIP-155 Chain ID
        uint256 evmChainId;
        address payable nativeAsset;
        uint256 parentChainIdEVM;
    }
}

contract XBurnMintERC20State {
    XBurnMintERC20Storage.State _state;
}
