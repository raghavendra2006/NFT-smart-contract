// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../NftCollection.sol";

/**
 * @title MockERC721Receiver
 * @dev A contract that correctly implements IERC721Receiver for testing safe transfers.
 */
contract MockERC721Receiver is IERC721Receiver {
    event Received(address operator, address from, uint256 tokenId, bytes data);

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        emit Received(operator, from, tokenId, data);
        return IERC721Receiver.onERC721Received.selector;
    }
}

/**
 * @title MockNonReceiver
 * @dev A contract that does NOT implement IERC721Receiver, used to test revert on safe transfer.
 */
contract MockNonReceiver {
    // Intentionally empty - does not implement onERC721Received
}

/**
 * @title MockBadReceiver
 * @dev A contract that implements onERC721Received but returns wrong value.
 */
contract MockBadReceiver is IERC721Receiver {
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("wrong"));
    }
}
