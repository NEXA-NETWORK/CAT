// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../shared/WormholeStructs.sol";
import "../interfaces/IWormholeReceiver.sol";
import "../interfaces/ICATERC20Proxy.sol";
import "../interfaces/IERC20Extended.sol";
import "./Governance.sol";
import "./Structs.sol";

// NOTE: DISCLAIMER! This standard will not work with deflationary or inflationary tokens including rebasing token that change users balances over time automatically

contract CATERC20Proxy is Context, CATERC20Governance, CATERC20Events, ERC165, IWormholeReceiver {
    using SafeERC20 for IERC20Extended;

    constructor() {
        setEvmChainId(block.chainid);
    }

    function initialize(
        uint16 chainId,
        address nativeToken,
        address wormhole
    ) public onlyOwner {
        require(isInitialized() == false, "Already Initialized");

        setChainId(chainId);
        setWormhole(wormhole);
        setNativeAsset(nativeToken);
        setDecimals(nativeAsset().decimals());
        setIsInitialized();
    }

    function decimals() public view virtual returns (uint8) {
        return getDecimals();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(ICATERC20Proxy).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev To bridge tokens to other chains.
     */
    function bridgeOut(
        uint256 amount,
        uint16 recipientChain,
        bytes32 recipient
    ) external payable returns (uint64 sequence) {
        require(isInitialized() == true, "Not Initialized");
        require(evmChainId() == block.chainid, "unsupported fork");

        (uint256 cost, ) = wormhole().quoteEVMDeliveryPrice(recipientChain, 0, 200000);
        require(msg.value >= cost, "Insufficient wormhole gas");
        
        uint16 tokenChain = chainId();
        bytes32 tokenAddress = bytes32(uint256(uint160(address(this))));

        uint256 balanceBefore = nativeAsset().balanceOf(address(this));
        // Transfer in contract and lock the tokens in this contract
        SafeERC20.safeTransferFrom(nativeAsset(), _msgSender(), address(this), amount);

        uint256 amountReceived = nativeAsset().balanceOf(address(this)) - balanceBefore;

        CATERC20Structs.CrossChainPayload memory transfer = CATERC20Structs.CrossChainPayload({
            amount: amountReceived,
            tokenAddress: tokenAddress,
            tokenChain: tokenChain,
            toAddress: recipient,
            toChain: recipientChain,
            tokenDecimals: getDecimals()
        });

        sequence = wormhole().sendPayloadToEvm{value: cost}(
            recipientChain,
            bytesToAddress(tokenAddress),
            encodeTransfer(transfer),
            0,
            200000,
            chainId(),
            msg.sender
        );

        emit bridgeOutEvent(
            amountReceived,
            tokenChain,
            recipientChain,
            addressToBytes(_msgSender()),
            recipient
        );
    } // end of function

    function bridgeIn(bytes memory encodedPayload, bytes32 deliveryHash) internal returns (bytes memory) {
        CATERC20Structs.CrossChainPayload memory transfer = decodeTransfer(encodedPayload);
        address transferRecipient = bytesToAddress(transfer.toAddress);

        require(!isTransferCompleted(deliveryHash), "transfer already completed");
        setTransferCompleted(deliveryHash);

        require(transfer.toChain == chainId(), "invalid target chain");

        uint256 nativeAmount = normalizeAmount(
            transfer.amount,
            transfer.tokenDecimals,
            getDecimals()
        );

        // Unlock the tokens in this contract and Transfer out from contract to user
        SafeERC20.safeTransfer(nativeAsset(), transferRecipient, nativeAmount);

        emit bridgeInEvent(nativeAmount, transfer.tokenChain, transfer.toChain, transfer.toAddress);

        return encodedPayload;
    }

    function receiveWormholeMessages(
        bytes memory payload,
        bytes[] memory,
        bytes32 srcAddress,
        uint16 srcChain,
        bytes32 deliveryHash
    ) external payable override {
        require(isInitialized() == true, "Not Initialized");
        require(evmChainId() == block.chainid, "unsupported fork");

        require(
            bytesToAddress(srcAddress) == address(this) ||
                tokenContracts(srcChain) == srcAddress,
            "Invalid Emitter"
        );

        bridgeIn(payload, deliveryHash);
    } 
}
