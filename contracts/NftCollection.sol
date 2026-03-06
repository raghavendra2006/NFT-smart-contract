// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC165
 * @dev ERC-165 standard interface detection.
 */
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/**
 * @title IERC721
 * @dev ERC-721 Non-Fungible Token Standard interface.
 */
interface IERC721 is IERC165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/**
 * @title IERC721Metadata
 * @dev ERC-721 metadata extension interface.
 */
interface IERC721Metadata is IERC721 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

/**
 * @title IERC721Receiver
 * @dev Interface for contracts that want to support safeTransfers from ERC-721 contracts.
 */
interface IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}

/**
 * @title NftCollection
 * @author NFT Collection
 * @notice A fully ERC-721 compatible NFT contract with minting controls, burning, pausable minting, and metadata.
 * @dev Implements ERC-721, ERC-721Metadata, and ERC-165. Uses custom errors for gas efficiency.
 *      Follows checks-effects-interactions pattern in safe transfers to prevent re-entrancy.
 */
contract NftCollection is IERC721Metadata {
    // ──────────────────────────────────────────────
    //  Custom Errors (gas-efficient over string reverts)
    // ──────────────────────────────────────────────

    error ZeroAddress();
    error TokenAlreadyMinted(uint256 tokenId);
    error TokenDoesNotExist(uint256 tokenId);
    error InvalidTokenId(uint256 tokenId);
    error MaxSupplyReached(uint256 maxSupply);
    error MintingIsPaused();
    error NotOwner();
    error NotAuthorized();
    error ApprovalToCurrentOwner();
    error SelfApproval();
    error TransferToNonERC721Receiver(address to);
    error TransferFromIncorrectOwner(address from, uint256 tokenId);
    error TransferToZeroAddress();

    // ──────────────────────────────────────────────
    //  Custom Events
    // ──────────────────────────────────────────────

    event MintingPaused(address indexed account);
    event MintingUnpaused(address indexed account);
    event BaseURIUpdated(string newBaseURI);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ──────────────────────────────────────────────
    //  State Variables
    // ──────────────────────────────────────────────

    string private _name;
    string private _symbol;
    string private _baseURI;

    address private _owner;
    uint256 private immutable _maxSupply;
    uint256 private _totalSupply;
    bool private _mintingPaused;

    // Core ERC-721 mappings
    mapping(uint256 => address) private _owners;           // tokenId => owner
    mapping(address => uint256) private _balances;          // owner => token count
    mapping(uint256 => address) private _tokenApprovals;    // tokenId => approved address
    mapping(address => mapping(address => bool)) private _operatorApprovals; // owner => operator => approved

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != _owner) revert NotOwner();
        _;
    }

    modifier whenMintingNotPaused() {
        if (_mintingPaused) revert MintingIsPaused();
        _;
    }

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Initializes the NFT collection with name, symbol, max supply, and base URI.
     * @param collectionName The name of the NFT collection.
     * @param collectionSymbol The symbol of the NFT collection.
     * @param maxSupply_ The maximum number of tokens that can ever be minted.
     * @param baseURI_ The base URI for token metadata.
     */
    constructor(
        string memory collectionName,
        string memory collectionSymbol,
        uint256 maxSupply_,
        string memory baseURI_
    ) {
        if (maxSupply_ == 0) revert MaxSupplyReached(0);

        _name = collectionName;
        _symbol = collectionSymbol;
        _maxSupply = maxSupply_;
        _baseURI = baseURI_;
        _owner = msg.sender;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ──────────────────────────────────────────────
    //  ERC-165: Interface Support
    // ──────────────────────────────────────────────

    /**
     * @notice Returns true if the contract implements the given interface.
     * @dev Supports IERC165, IERC721, and IERC721Metadata.
     */
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||     // 0x01ffc9a7
            interfaceId == type(IERC721).interfaceId ||     // 0x80ac58cd
            interfaceId == type(IERC721Metadata).interfaceId; // 0x5b5e139f
    }

    // ──────────────────────────────────────────────
    //  ERC-721 Metadata
    // ──────────────────────────────────────────────

    /// @notice Returns the collection name.
    function name() external view override returns (string memory) {
        return _name;
    }

    /// @notice Returns the collection symbol.
    function symbol() external view override returns (string memory) {
        return _symbol;
    }

    /**
     * @notice Returns the metadata URI for a given token.
     * @dev Reverts if the token does not exist. Concatenates baseURI + tokenId.
     * @param tokenId The token to query.
     */
    function tokenURI(uint256 tokenId) external view override returns (string memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        return string(abi.encodePacked(_baseURI, _toString(tokenId)));
    }

    // ──────────────────────────────────────────────
    //  ERC-721 Core Read Functions
    // ──────────────────────────────────────────────

    /// @notice Returns the number of tokens owned by `ownerAddr`.
    function balanceOf(address ownerAddr) external view override returns (uint256) {
        if (ownerAddr == address(0)) revert ZeroAddress();
        return _balances[ownerAddr];
    }

    /// @notice Returns the owner of a given tokenId. Reverts if token does not exist.
    function ownerOf(uint256 tokenId) public view override returns (address) {
        address tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert TokenDoesNotExist(tokenId);
        return tokenOwner;
    }

    /// @notice Returns the approved address for a tokenId, or zero if none.
    function getApproved(uint256 tokenId) public view override returns (address) {
        if (!_exists(tokenId)) revert TokenDoesNotExist(tokenId);
        return _tokenApprovals[tokenId];
    }

    /// @notice Returns whether `operator` is approved for all tokens of `ownerAddr`.
    function isApprovedForAll(address ownerAddr, address operator) public view override returns (bool) {
        return _operatorApprovals[ownerAddr][operator];
    }

    // ──────────────────────────────────────────────
    //  Collection Configuration (Read-only)
    // ──────────────────────────────────────────────

    /// @notice Returns the maximum supply of tokens for this collection.
    function maxSupply() external view returns (uint256) {
        return _maxSupply;
    }

    /// @notice Returns the current total supply of minted tokens.
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /// @notice Returns the current base URI for token metadata.
    function baseURI() external view returns (string memory) {
        return _baseURI;
    }

    /// @notice Returns whether minting is currently paused.
    function mintingPaused() external view returns (bool) {
        return _mintingPaused;
    }

    /// @notice Returns the contract owner address.
    function owner() external view returns (address) {
        return _owner;
    }

    // ──────────────────────────────────────────────
    //  Minting
    // ──────────────────────────────────────────────

    /**
     * @notice Mints a new token to the given address with a specified tokenId.
     * @dev Only callable by the contract owner. Checks max supply, valid tokenId range,
     *      non-zero address, and that the token hasn't been minted yet.
     *      Uses safe transfer check if `to` is a contract.
     * @param to The address to receive the minted token.
     * @param tokenId The unique identifier for the new token.
     */
    function safeMint(address to, uint256 tokenId) external onlyOwner whenMintingNotPaused {
        // Validate inputs
        if (to == address(0)) revert ZeroAddress();
        if (tokenId == 0 || tokenId > _maxSupply) revert InvalidTokenId(tokenId);
        if (_owners[tokenId] != address(0)) revert TokenAlreadyMinted(tokenId);
        if (_totalSupply >= _maxSupply) revert MaxSupplyReached(_maxSupply);

        // Effects: update state BEFORE external call (checks-effects-interactions)
        _totalSupply += 1;
        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(address(0), to, tokenId);

        // Interaction: check receiver if `to` is a contract
        _checkOnERC721Received(address(0), to, tokenId, "");
    }

    // ──────────────────────────────────────────────
    //  Burning
    // ──────────────────────────────────────────────

    /**
     * @notice Burns (destroys) a token. Only the token owner can burn their token.
     * @dev Clears approval, decrements balance and supply, removes ownership.
     * @param tokenId The token to burn.
     */
    function burn(uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        if (msg.sender != tokenOwner) revert NotAuthorized();

        // Clear approval
        delete _tokenApprovals[tokenId];

        // Update state
        _balances[tokenOwner] -= 1;
        _totalSupply -= 1;
        delete _owners[tokenId];

        emit Transfer(tokenOwner, address(0), tokenId);
    }

    // ──────────────────────────────────────────────
    //  Transfers
    // ──────────────────────────────────────────────

    /**
     * @notice Transfers a token from one address to another.
     * @dev Caller must be the owner, approved for the token, or an approved operator.
     */
    function transferFrom(address from, address to, uint256 tokenId) public override {
        _transfer(from, to, tokenId);
    }

    /**
     * @notice Safely transfers a token, checking if the receiver can handle ERC-721 tokens.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId) external override {
        safeTransferFrom(from, to, tokenId, "");
    }

    /**
     * @notice Safely transfers a token with additional data, checking if the receiver can handle ERC-721 tokens.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
        _transfer(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, data);
    }

    // ──────────────────────────────────────────────
    //  Approvals
    // ──────────────────────────────────────────────

    /**
     * @notice Approves another address to transfer the given token on behalf of the owner.
     * @dev Caller must be the token owner or an approved operator.
     *      Cannot approve the token owner themselves. Cannot self-approve.
     */
    function approve(address to, uint256 tokenId) external override {
        address tokenOwner = ownerOf(tokenId);
        if (to == tokenOwner) revert ApprovalToCurrentOwner();
        if (msg.sender != tokenOwner && !isApprovedForAll(tokenOwner, msg.sender)) {
            revert NotAuthorized();
        }

        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    /**
     * @notice Sets or revokes approval for an operator to manage all of the caller's tokens.
     * @dev Cannot set self as operator.
     */
    function setApprovalForAll(address operator, bool approved) external override {
        if (operator == msg.sender) revert SelfApproval();
        if (operator == address(0)) revert ZeroAddress();

        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // ──────────────────────────────────────────────
    //  Admin Functions
    // ──────────────────────────────────────────────

    /// @notice Pauses minting. Only callable by the contract owner.
    function pauseMinting() external onlyOwner {
        _mintingPaused = true;
        emit MintingPaused(msg.sender);
    }

    /// @notice Unpauses minting. Only callable by the contract owner.
    function unpauseMinting() external onlyOwner {
        _mintingPaused = false;
        emit MintingUnpaused(msg.sender);
    }

    /**
     * @notice Updates the base URI for token metadata.
     * @param newBaseURI The new base URI string.
     */
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /**
     * @notice Transfers ownership of the contract to a new address.
     * @param newOwner The address of the new owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ──────────────────────────────────────────────
    //  Internal Helpers
    // ──────────────────────────────────────────────

    /**
     * @dev Returns whether a token with the given ID exists (has been minted and not burned).
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _owners[tokenId] != address(0);
    }

    /**
     * @dev Returns whether `spender` is allowed to manage `tokenId`.
     *      Checks: owner, approved for token, or approved operator.
     */
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tokenOwner = ownerOf(tokenId);
        return (
            spender == tokenOwner ||
            _tokenApprovals[tokenId] == spender ||
            _operatorApprovals[tokenOwner][spender]
        );
    }

    /**
     * @dev Internal transfer logic. Validates authorization, from/to addresses, and updates state atomically.
     *      Clears token approval after transfer.
     */
    function _transfer(address from, address to, uint256 tokenId) internal {
        // Validate the token exists and ownership is correct
        address tokenOwner = ownerOf(tokenId);
        if (tokenOwner != from) revert TransferFromIncorrectOwner(from, tokenId);
        if (to == address(0)) revert TransferToZeroAddress();

        // Authorization check
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert NotAuthorized();

        // Clear approval (atomic with transfer)
        delete _tokenApprovals[tokenId];

        // Update balances
        _balances[from] -= 1;
        _balances[to] += 1;

        // Transfer ownership
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    /**
     * @dev Checks if `to` is a contract and if so, that it implements IERC721Receiver.
     *      Called AFTER state changes to follow checks-effects-interactions.
     */
    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                if (retval != IERC721Receiver.onERC721Received.selector) {
                    revert TransferToNonERC721Receiver(to);
                }
            } catch {
                revert TransferToNonERC721Receiver(to);
            }
        }
    }

    /**
     * @dev Converts a uint256 to its ASCII string decimal representation.
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }
}
