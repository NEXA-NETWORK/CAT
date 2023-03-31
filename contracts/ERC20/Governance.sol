// contracts/Bridge.sol
// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

import "../libraries/BytesLib.sol";

import "./Getters.sol";
import "./Setters.sol";
import "./Structs.sol";

import "../interfaces/IWormhole.sol";

contract XBurnMintERC20Governance is XBurnMintERC20Getters, XBurnMintERC20Setters, Ownable {
    using BytesLib for bytes;

    // Execute a RegisterChain governance message
    function registerChain(uint16 chainId, bytes32 tokenContract) public onlyOwner {
        setTokenImplementation(chainId, tokenContract);
    }

    function registerChains(
        uint16[] memory chainId,
        bytes32[] memory tokenContract
    ) public onlyOwner {
        require(chainId.length == tokenContract.length, "Invalid Input");
        for (uint256 i = 0; i < tokenContract.length; i++) {
            setTokenImplementation(chainId[i], tokenContract[i]);
        }
    }

    // Execute a RegisterChain governance message
    function updateFinality(uint8 finality) public onlyOwner {
        setFinality(finality);
    }
}
