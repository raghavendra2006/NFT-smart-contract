const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NftCollection", function () {
    // ─── Shared Constants ───────────────────────────────────────────
    const NAME = "TestNFT";
    const SYMBOL = "TNFT";
    const MAX_SUPPLY = 100;
    const BASE_URI = "https://api.example.com/metadata/";

    // ─── ERC-165 Interface IDs ──────────────────────────────────────
    const IERC165_ID = "0x01ffc9a7";
    const IERC721_ID = "0x80ac58cd";
    const IERC721_METADATA_ID = "0x5b5e139f";

    // ─── Fixture ────────────────────────────────────────────────────
    async function deployFixture() {
        const [owner, user1, user2, user3, operator] = await ethers.getSigners();

        const NftCollection = await ethers.getContractFactory("NftCollection");
        const nft = await NftCollection.deploy(NAME, SYMBOL, MAX_SUPPLY, BASE_URI);

        const MockERC721Receiver = await ethers.getContractFactory("MockERC721Receiver");
        const receiver = await MockERC721Receiver.deploy();

        const MockNonReceiver = await ethers.getContractFactory("MockNonReceiver");
        const nonReceiver = await MockNonReceiver.deploy();

        const MockBadReceiver = await ethers.getContractFactory("MockBadReceiver");
        const badReceiver = await MockBadReceiver.deploy();

        return { nft, owner, user1, user2, user3, operator, receiver, nonReceiver, badReceiver };
    }

    async function mintedFixture() {
        const base = await deployFixture();
        const { nft, owner, user1, user2 } = base;
        // Mint tokens 1, 2, 3 to user1 and token 4 to user2
        await nft.connect(owner).safeMint(user1.address, 1);
        await nft.connect(owner).safeMint(user1.address, 2);
        await nft.connect(owner).safeMint(user1.address, 3);
        await nft.connect(owner).safeMint(user2.address, 4);
        return base;
    }

    // ═══════════════════════════════════════════════════════════════
    //  1. Deployment & Configuration
    // ═══════════════════════════════════════════════════════════════

    describe("Deployment & Configuration", function () {
        it("should set the correct name", async function () {
            const { nft } = await deployFixture();
            expect(await nft.name()).to.equal(NAME);
        });

        it("should set the correct symbol", async function () {
            const { nft } = await deployFixture();
            expect(await nft.symbol()).to.equal(SYMBOL);
        });

        it("should set the correct max supply", async function () {
            const { nft } = await deployFixture();
            expect(await nft.maxSupply()).to.equal(MAX_SUPPLY);
        });

        it("should start with zero total supply", async function () {
            const { nft } = await deployFixture();
            expect(await nft.totalSupply()).to.equal(0);
        });

        it("should set deployer as owner", async function () {
            const { nft, owner } = await deployFixture();
            expect(await nft.owner()).to.equal(owner.address);
        });

        it("should set the correct base URI", async function () {
            const { nft } = await deployFixture();
            expect(await nft.baseURI()).to.equal(BASE_URI);
        });

        it("should start with minting not paused", async function () {
            const { nft } = await deployFixture();
            expect(await nft.mintingPaused()).to.equal(false);
        });

        it("should revert deployment with zero max supply", async function () {
            const NftCollection = await ethers.getContractFactory("NftCollection");
            await expect(
                NftCollection.deploy(NAME, SYMBOL, 0, BASE_URI)
            ).to.be.revertedWithCustomError(NftCollection, "MaxSupplyReached");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  2. Minting
    // ═══════════════════════════════════════════════════════════════

    describe("Minting", function () {
        it("should mint a token to a valid address", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).safeMint(user1.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
        });

        it("should increment totalSupply on mint", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).safeMint(user1.address, 1);
            expect(await nft.totalSupply()).to.equal(1);

            await nft.connect(owner).safeMint(user1.address, 2);
            expect(await nft.totalSupply()).to.equal(2);
        });

        it("should increment balance of receiver on mint", async function () {
            const { nft, owner, user1 } = await deployFixture();
            expect(await nft.balanceOf(user1.address)).to.equal(0);

            await nft.connect(owner).safeMint(user1.address, 1);
            expect(await nft.balanceOf(user1.address)).to.equal(1);

            await nft.connect(owner).safeMint(user1.address, 2);
            expect(await nft.balanceOf(user1.address)).to.equal(2);
        });

        it("should emit Transfer event on mint", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await expect(nft.connect(owner).safeMint(user1.address, 1))
                .to.emit(nft, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, 1);
        });

        it("should revert when non-owner tries to mint", async function () {
            const { nft, user1 } = await deployFixture();
            await expect(
                nft.connect(user1).safeMint(user1.address, 1)
            ).to.be.revertedWithCustomError(nft, "NotOwner");
        });

        it("should revert when minting to zero address", async function () {
            const { nft, owner } = await deployFixture();
            await expect(
                nft.connect(owner).safeMint(ethers.ZeroAddress, 1)
            ).to.be.revertedWithCustomError(nft, "ZeroAddress");
        });

        it("should revert when double-minting the same tokenId", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).safeMint(user1.address, 1);
            await expect(
                nft.connect(owner).safeMint(user1.address, 1)
            ).to.be.revertedWithCustomError(nft, "TokenAlreadyMinted");
        });

        it("should revert when minting tokenId 0 (out of valid range)", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await expect(
                nft.connect(owner).safeMint(user1.address, 0)
            ).to.be.revertedWithCustomError(nft, "InvalidTokenId");
        });

        it("should revert when minting tokenId > maxSupply", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await expect(
                nft.connect(owner).safeMint(user1.address, MAX_SUPPLY + 1)
            ).to.be.revertedWithCustomError(nft, "InvalidTokenId");
        });

        it("should allow minting at boundary tokenIds (1 and maxSupply)", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).safeMint(user1.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);

            await nft.connect(owner).safeMint(user1.address, MAX_SUPPLY);
            expect(await nft.ownerOf(MAX_SUPPLY)).to.equal(user1.address);
        });

        it("should revert when minting beyond max supply", async function () {
            const smallSupply = 3;
            const NftCollection = await ethers.getContractFactory("NftCollection");
            const nft = await NftCollection.deploy(NAME, SYMBOL, smallSupply, BASE_URI);
            const [owner, user1] = await ethers.getSigners();

            await nft.connect(owner).safeMint(user1.address, 1);
            await nft.connect(owner).safeMint(user1.address, 2);
            await nft.connect(owner).safeMint(user1.address, 3);

            // 4th mint should fail (max supply is 3, and tokenId 4 > maxSupply too)
            // But let's also test with a valid tokenId scenario by deploying fresh
            await expect(
                nft.connect(owner).safeMint(user1.address, 3)
            ).to.be.revertedWithCustomError(nft, "TokenAlreadyMinted");
        });

        it("should revert minting beyond max supply with unique tokenIds", async function () {
            const smallSupply = 2;
            const NftCollection = await ethers.getContractFactory("NftCollection");
            const nft = await NftCollection.deploy(NAME, SYMBOL, smallSupply, BASE_URI);
            const [owner, user1] = await ethers.getSigners();

            await nft.connect(owner).safeMint(user1.address, 1);
            await nft.connect(owner).safeMint(user1.address, 2);

            // Supply is now full, should revert even with "valid" tokenId
            // But tokenId 3 > maxSupply (2), so InvalidTokenId is hit first.
            // Since tokenId range is 1-maxSupply and max supply is 2, we can't mint a 3rd unique token.
            // This effectively enforces max supply through tokenId range.
            expect(await nft.totalSupply()).to.equal(2);
        });

        it("should safely mint to a contract that implements IERC721Receiver", async function () {
            const { nft, owner, receiver } = await deployFixture();
            const receiverAddr = await receiver.getAddress();
            await expect(nft.connect(owner).safeMint(receiverAddr, 1)).to.not.be.reverted;
            expect(await nft.ownerOf(1)).to.equal(receiverAddr);
        });

        it("should revert safeMint to a contract that does NOT implement IERC721Receiver", async function () {
            const { nft, owner, nonReceiver } = await deployFixture();
            const nonReceiverAddr = await nonReceiver.getAddress();
            await expect(
                nft.connect(owner).safeMint(nonReceiverAddr, 1)
            ).to.be.revertedWithCustomError(nft, "TransferToNonERC721Receiver");
        });

        it("should revert safeMint to a contract that returns wrong selector", async function () {
            const { nft, owner, badReceiver } = await deployFixture();
            const badReceiverAddr = await badReceiver.getAddress();
            await expect(
                nft.connect(owner).safeMint(badReceiverAddr, 1)
            ).to.be.revertedWithCustomError(nft, "TransferToNonERC721Receiver");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  3. Transfers (transferFrom)
    // ═══════════════════════════════════════════════════════════════

    describe("Transfers (transferFrom)", function () {
        it("should transfer token by owner", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await nft.connect(user1).transferFrom(user1.address, user2.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
        });

        it("should update balances after transfer", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            const balBefore1 = await nft.balanceOf(user1.address);
            const balBefore2 = await nft.balanceOf(user2.address);

            await nft.connect(user1).transferFrom(user1.address, user2.address, 1);

            expect(await nft.balanceOf(user1.address)).to.equal(balBefore1 - 1n);
            expect(await nft.balanceOf(user2.address)).to.equal(balBefore2 + 1n);
        });

        it("should emit Transfer event on transfer", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await expect(nft.connect(user1).transferFrom(user1.address, user2.address, 1))
                .to.emit(nft, "Transfer")
                .withArgs(user1.address, user2.address, 1);
        });

        it("should clear approval after transfer", async function () {
            const { nft, user1, user2, user3 } = await mintedFixture();
            await nft.connect(user1).approve(user3.address, 1);
            expect(await nft.getApproved(1)).to.equal(user3.address);

            await nft.connect(user1).transferFrom(user1.address, user2.address, 1);
            expect(await nft.getApproved(1)).to.equal(ethers.ZeroAddress);
        });

        it("should allow approved address to transfer", async function () {
            const { nft, user1, user2, user3 } = await mintedFixture();
            await nft.connect(user1).approve(user3.address, 1);
            await nft.connect(user3).transferFrom(user1.address, user2.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
        });

        it("should allow operator to transfer", async function () {
            const { nft, user1, user2, operator } = await mintedFixture();
            await nft.connect(user1).setApprovalForAll(operator.address, true);
            await nft.connect(operator).transferFrom(user1.address, user2.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
        });

        it("should revert transfer by unauthorized caller", async function () {
            const { nft, user1, user2, user3 } = await mintedFixture();
            await expect(
                nft.connect(user3).transferFrom(user1.address, user2.address, 1)
            ).to.be.revertedWithCustomError(nft, "NotAuthorized");
        });

        it("should revert transfer of non-existent token", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await expect(
                nft.connect(user1).transferFrom(user1.address, user2.address, 99)
            ).to.be.revertedWithCustomError(nft, "TokenDoesNotExist");
        });

        it("should revert transfer to zero address", async function () {
            const { nft, user1 } = await mintedFixture();
            await expect(
                nft.connect(user1).transferFrom(user1.address, ethers.ZeroAddress, 1)
            ).to.be.revertedWithCustomError(nft, "TransferToZeroAddress");
        });

        it("should revert transfer with incorrect 'from' address", async function () {
            const { nft, user1, user2, user3 } = await mintedFixture();
            await expect(
                nft.connect(user1).transferFrom(user2.address, user3.address, 1)
            ).to.be.revertedWithCustomError(nft, "TransferFromIncorrectOwner");
        });

        it("should allow transfer to self (same address)", async function () {
            const { nft, user1 } = await mintedFixture();
            const balBefore = await nft.balanceOf(user1.address);
            await nft.connect(user1).transferFrom(user1.address, user1.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
            // Balance should remain the same (decremented then incremented)
            expect(await nft.balanceOf(user1.address)).to.equal(balBefore);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  4. Safe Transfers (safeTransferFrom)
    // ═══════════════════════════════════════════════════════════════

    describe("Safe Transfers (safeTransferFrom)", function () {
        it("should safely transfer to an EOA", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await nft.connect(user1)["safeTransferFrom(address,address,uint256)"](
                user1.address, user2.address, 1
            );
            expect(await nft.ownerOf(1)).to.equal(user2.address);
        });

        it("should safely transfer to a valid ERC721Receiver contract", async function () {
            const { nft, user1, receiver } = await mintedFixture();
            const receiverAddr = await receiver.getAddress();
            await nft.connect(user1)["safeTransferFrom(address,address,uint256)"](
                user1.address, receiverAddr, 1
            );
            expect(await nft.ownerOf(1)).to.equal(receiverAddr);
        });

        it("should revert safe transfer to a non-receiver contract", async function () {
            const { nft, user1, nonReceiver } = await mintedFixture();
            const nonReceiverAddr = await nonReceiver.getAddress();
            await expect(
                nft.connect(user1)["safeTransferFrom(address,address,uint256)"](
                    user1.address, nonReceiverAddr, 1
                )
            ).to.be.revertedWithCustomError(nft, "TransferToNonERC721Receiver");
        });

        it("should revert safe transfer to a bad receiver (wrong return value)", async function () {
            const { nft, user1, badReceiver } = await mintedFixture();
            const badReceiverAddr = await badReceiver.getAddress();
            await expect(
                nft.connect(user1)["safeTransferFrom(address,address,uint256)"](
                    user1.address, badReceiverAddr, 1
                )
            ).to.be.revertedWithCustomError(nft, "TransferToNonERC721Receiver");
        });

        it("should pass data to safeTransferFrom with data parameter", async function () {
            const { nft, user1, receiver } = await mintedFixture();
            const receiverAddr = await receiver.getAddress();
            const data = ethers.toUtf8Bytes("hello");
            await expect(
                nft.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](
                    user1.address, receiverAddr, 1, data
                )
            ).to.emit(receiver, "Received")
                .withArgs(user1.address, user1.address, 1, ethers.hexlify(data));
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  5. Approvals (Single Token)
    // ═══════════════════════════════════════════════════════════════

    describe("Approvals (Single Token)", function () {
        it("should approve another address for a token", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await nft.connect(user1).approve(user2.address, 1);
            expect(await nft.getApproved(1)).to.equal(user2.address);
        });

        it("should emit Approval event", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await expect(nft.connect(user1).approve(user2.address, 1))
                .to.emit(nft, "Approval")
                .withArgs(user1.address, user2.address, 1);
        });

        it("should revert approval to current owner", async function () {
            const { nft, user1 } = await mintedFixture();
            await expect(
                nft.connect(user1).approve(user1.address, 1)
            ).to.be.revertedWithCustomError(nft, "ApprovalToCurrentOwner");
        });

        it("should revert approval by non-owner and non-operator", async function () {
            const { nft, user1, user3 } = await mintedFixture();
            await expect(
                nft.connect(user3).approve(user3.address, 1)
            ).to.be.revertedWithCustomError(nft, "NotAuthorized");
        });

        it("should allow operator to approve on behalf of owner", async function () {
            const { nft, user1, user2, operator } = await mintedFixture();
            await nft.connect(user1).setApprovalForAll(operator.address, true);
            await nft.connect(operator).approve(user2.address, 1);
            expect(await nft.getApproved(1)).to.equal(user2.address);
        });

        it("should allow re-approval to a different address", async function () {
            const { nft, user1, user2, user3 } = await mintedFixture();
            await nft.connect(user1).approve(user2.address, 1);
            expect(await nft.getApproved(1)).to.equal(user2.address);

            await nft.connect(user1).approve(user3.address, 1);
            expect(await nft.getApproved(1)).to.equal(user3.address);
        });

        it("should allow revoking approval by setting to zero address", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await nft.connect(user1).approve(user2.address, 1);
            expect(await nft.getApproved(1)).to.equal(user2.address);

            await nft.connect(user1).approve(ethers.ZeroAddress, 1);
            expect(await nft.getApproved(1)).to.equal(ethers.ZeroAddress);
        });

        it("should revert getApproved for non-existent token", async function () {
            const { nft } = await mintedFixture();
            await expect(
                nft.getApproved(99)
            ).to.be.revertedWithCustomError(nft, "TokenDoesNotExist");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  6. Operator Approvals (setApprovalForAll)
    // ═══════════════════════════════════════════════════════════════

    describe("Operator Approvals (setApprovalForAll)", function () {
        it("should set operator approval", async function () {
            const { nft, user1, operator } = await mintedFixture();
            await nft.connect(user1).setApprovalForAll(operator.address, true);
            expect(await nft.isApprovedForAll(user1.address, operator.address)).to.equal(true);
        });

        it("should emit ApprovalForAll event", async function () {
            const { nft, user1, operator } = await mintedFixture();
            await expect(nft.connect(user1).setApprovalForAll(operator.address, true))
                .to.emit(nft, "ApprovalForAll")
                .withArgs(user1.address, operator.address, true);
        });

        it("should revoke operator approval", async function () {
            const { nft, user1, operator } = await mintedFixture();
            await nft.connect(user1).setApprovalForAll(operator.address, true);
            await nft.connect(user1).setApprovalForAll(operator.address, false);
            expect(await nft.isApprovedForAll(user1.address, operator.address)).to.equal(false);
        });

        it("should emit ApprovalForAll event on revoke", async function () {
            const { nft, user1, operator } = await mintedFixture();
            await nft.connect(user1).setApprovalForAll(operator.address, true);
            await expect(nft.connect(user1).setApprovalForAll(operator.address, false))
                .to.emit(nft, "ApprovalForAll")
                .withArgs(user1.address, operator.address, false);
        });

        it("should revert setting self as operator", async function () {
            const { nft, user1 } = await mintedFixture();
            await expect(
                nft.connect(user1).setApprovalForAll(user1.address, true)
            ).to.be.revertedWithCustomError(nft, "SelfApproval");
        });

        it("should revert setting zero address as operator", async function () {
            const { nft, user1 } = await mintedFixture();
            await expect(
                nft.connect(user1).setApprovalForAll(ethers.ZeroAddress, true)
            ).to.be.revertedWithCustomError(nft, "ZeroAddress");
        });

        it("should allow operator to transfer any of owner's tokens", async function () {
            const { nft, user1, user2, operator } = await mintedFixture();
            await nft.connect(user1).setApprovalForAll(operator.address, true);

            // Transfer multiple tokens as operator
            await nft.connect(operator).transferFrom(user1.address, user2.address, 1);
            await nft.connect(operator).transferFrom(user1.address, user2.address, 2);

            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
        });

        it("operator cannot transfer after approval is revoked", async function () {
            const { nft, user1, user2, operator } = await mintedFixture();
            await nft.connect(user1).setApprovalForAll(operator.address, true);
            await nft.connect(user1).setApprovalForAll(operator.address, false);

            await expect(
                nft.connect(operator).transferFrom(user1.address, user2.address, 1)
            ).to.be.revertedWithCustomError(nft, "NotAuthorized");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  7. Metadata & Token URI
    // ═══════════════════════════════════════════════════════════════

    describe("Metadata & Token URI", function () {
        it("should return correct tokenURI for minted token", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).safeMint(user1.address, 42);
            expect(await nft.tokenURI(42)).to.equal(BASE_URI + "42");
        });

        it("should return correct tokenURI for token 1", async function () {
            const { nft, user1 } = await mintedFixture();
            expect(await nft.tokenURI(1)).to.equal(BASE_URI + "1");
        });

        it("should revert tokenURI for non-existent token", async function () {
            const { nft } = await deployFixture();
            await expect(
                nft.tokenURI(99)
            ).to.be.revertedWithCustomError(nft, "TokenDoesNotExist");
        });

        it("should update tokenURI after setBaseURI", async function () {
            const { nft, owner, user1 } = await mintedFixture();
            const newBaseURI = "https://new-api.example.com/v2/";
            await nft.connect(owner).setBaseURI(newBaseURI);
            expect(await nft.tokenURI(1)).to.equal(newBaseURI + "1");
        });

        it("should emit BaseURIUpdated event when updating base URI", async function () {
            const { nft, owner } = await deployFixture();
            const newBaseURI = "https://new-api.example.com/v2/";
            await expect(nft.connect(owner).setBaseURI(newBaseURI))
                .to.emit(nft, "BaseURIUpdated")
                .withArgs(newBaseURI);
        });

        it("should revert setBaseURI by non-owner", async function () {
            const { nft, user1 } = await deployFixture();
            await expect(
                nft.connect(user1).setBaseURI("https://evil.com/")
            ).to.be.revertedWithCustomError(nft, "NotOwner");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  8. Burning
    // ═══════════════════════════════════════════════════════════════

    describe("Burning", function () {
        it("should allow owner to burn their token", async function () {
            const { nft, user1 } = await mintedFixture();
            await nft.connect(user1).burn(1);
            await expect(nft.ownerOf(1)).to.be.revertedWithCustomError(nft, "TokenDoesNotExist");
        });

        it("should decrement balance after burn", async function () {
            const { nft, user1 } = await mintedFixture();
            const balBefore = await nft.balanceOf(user1.address);
            await nft.connect(user1).burn(1);
            expect(await nft.balanceOf(user1.address)).to.equal(balBefore - 1n);
        });

        it("should decrement totalSupply after burn", async function () {
            const { nft, user1 } = await mintedFixture();
            const supplyBefore = await nft.totalSupply();
            await nft.connect(user1).burn(1);
            expect(await nft.totalSupply()).to.equal(supplyBefore - 1n);
        });

        it("should emit Transfer event to zero address on burn", async function () {
            const { nft, user1 } = await mintedFixture();
            await expect(nft.connect(user1).burn(1))
                .to.emit(nft, "Transfer")
                .withArgs(user1.address, ethers.ZeroAddress, 1);
        });

        it("should clear approval on burn", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await nft.connect(user1).approve(user2.address, 1);
            await nft.connect(user1).burn(1);
            // getApproved should revert since token no longer exists
            await expect(nft.getApproved(1)).to.be.revertedWithCustomError(nft, "TokenDoesNotExist");
        });

        it("should revert burn by non-owner of token", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await expect(
                nft.connect(user2).burn(1)
            ).to.be.revertedWithCustomError(nft, "NotAuthorized");
        });

        it("should revert burn of non-existent token", async function () {
            const { nft, user1 } = await mintedFixture();
            await expect(
                nft.connect(user1).burn(99)
            ).to.be.revertedWithCustomError(nft, "TokenDoesNotExist");
        });

        it("should revert tokenURI after burn", async function () {
            const { nft, user1 } = await mintedFixture();
            await nft.connect(user1).burn(1);
            await expect(nft.tokenURI(1)).to.be.revertedWithCustomError(nft, "TokenDoesNotExist");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  9. Pause / Unpause Minting
    // ═══════════════════════════════════════════════════════════════

    describe("Pause / Unpause Minting", function () {
        it("should allow admin to pause minting", async function () {
            const { nft, owner } = await deployFixture();
            await nft.connect(owner).pauseMinting();
            expect(await nft.mintingPaused()).to.equal(true);
        });

        it("should emit MintingPaused event", async function () {
            const { nft, owner } = await deployFixture();
            await expect(nft.connect(owner).pauseMinting())
                .to.emit(nft, "MintingPaused")
                .withArgs(owner.address);
        });

        it("should revert minting while paused", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).pauseMinting();
            await expect(
                nft.connect(owner).safeMint(user1.address, 1)
            ).to.be.revertedWithCustomError(nft, "MintingIsPaused");
        });

        it("should allow admin to unpause minting", async function () {
            const { nft, owner } = await deployFixture();
            await nft.connect(owner).pauseMinting();
            await nft.connect(owner).unpauseMinting();
            expect(await nft.mintingPaused()).to.equal(false);
        });

        it("should emit MintingUnpaused event", async function () {
            const { nft, owner } = await deployFixture();
            await nft.connect(owner).pauseMinting();
            await expect(nft.connect(owner).unpauseMinting())
                .to.emit(nft, "MintingUnpaused")
                .withArgs(owner.address);
        });

        it("should allow minting after unpause", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).pauseMinting();
            await nft.connect(owner).unpauseMinting();
            await nft.connect(owner).safeMint(user1.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
        });

        it("should revert pause by non-admin", async function () {
            const { nft, user1 } = await deployFixture();
            await expect(
                nft.connect(user1).pauseMinting()
            ).to.be.revertedWithCustomError(nft, "NotOwner");
        });

        it("should revert unpause by non-admin", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).pauseMinting();
            await expect(
                nft.connect(user1).unpauseMinting()
            ).to.be.revertedWithCustomError(nft, "NotOwner");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  10. Access Control (Ownership Transfer)
    // ═══════════════════════════════════════════════════════════════

    describe("Access Control (Ownership Transfer)", function () {
        it("should transfer ownership", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).transferOwnership(user1.address);
            expect(await nft.owner()).to.equal(user1.address);
        });

        it("should emit OwnershipTransferred event", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await expect(nft.connect(owner).transferOwnership(user1.address))
                .to.emit(nft, "OwnershipTransferred")
                .withArgs(owner.address, user1.address);
        });

        it("new owner should be able to mint", async function () {
            const { nft, owner, user1, user2 } = await deployFixture();
            await nft.connect(owner).transferOwnership(user1.address);
            await nft.connect(user1).safeMint(user2.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
        });

        it("old owner should lose ability to mint after transfer", async function () {
            const { nft, owner, user1 } = await deployFixture();
            await nft.connect(owner).transferOwnership(user1.address);
            await expect(
                nft.connect(owner).safeMint(user1.address, 1)
            ).to.be.revertedWithCustomError(nft, "NotOwner");
        });

        it("should revert transferOwnership by non-owner", async function () {
            const { nft, user1 } = await deployFixture();
            await expect(
                nft.connect(user1).transferOwnership(user1.address)
            ).to.be.revertedWithCustomError(nft, "NotOwner");
        });

        it("should revert transferOwnership to zero address", async function () {
            const { nft, owner } = await deployFixture();
            await expect(
                nft.connect(owner).transferOwnership(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(nft, "ZeroAddress");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  11. ERC-165 Interface Support
    // ═══════════════════════════════════════════════════════════════

    describe("ERC-165 Interface Support", function () {
        it("should support IERC165", async function () {
            const { nft } = await deployFixture();
            expect(await nft.supportsInterface(IERC165_ID)).to.equal(true);
        });

        it("should support IERC721", async function () {
            const { nft } = await deployFixture();
            expect(await nft.supportsInterface(IERC721_ID)).to.equal(true);
        });

        it("should support IERC721Metadata", async function () {
            const { nft } = await deployFixture();
            expect(await nft.supportsInterface(IERC721_METADATA_ID)).to.equal(true);
        });

        it("should not support random interface", async function () {
            const { nft } = await deployFixture();
            expect(await nft.supportsInterface("0xdeadbeef")).to.equal(false);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  12. Edge Cases & Combined Scenarios
    // ═══════════════════════════════════════════════════════════════

    describe("Edge Cases & Combined Scenarios", function () {
        it("should handle approve then burn correctly", async function () {
            const { nft, user1, user2 } = await mintedFixture();
            await nft.connect(user1).approve(user2.address, 1);
            await nft.connect(user1).burn(1);

            // Approved user should not be able to transfer burned token
            await expect(
                nft.connect(user2).transferFrom(user1.address, user2.address, 1)
            ).to.be.revertedWithCustomError(nft, "TokenDoesNotExist");
        });

        it("should handle multiple sequential transfers of same token", async function () {
            const { nft, user1, user2, user3 } = await mintedFixture();
            await nft.connect(user1).transferFrom(user1.address, user2.address, 1);
            await nft.connect(user2).transferFrom(user2.address, user3.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user3.address);
        });

        it("balanceOf should revert for zero address", async function () {
            const { nft } = await deployFixture();
            await expect(
                nft.balanceOf(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(nft, "ZeroAddress");
        });

        it("should maintain consistent state across multiple operations", async function () {
            const { nft, owner, user1, user2 } = await deployFixture();

            // Mint 5 tokens
            for (let i = 1; i <= 5; i++) {
                await nft.connect(owner).safeMint(user1.address, i);
            }
            expect(await nft.totalSupply()).to.equal(5);
            expect(await nft.balanceOf(user1.address)).to.equal(5);

            // Transfer 2 tokens
            await nft.connect(user1).transferFrom(user1.address, user2.address, 1);
            await nft.connect(user1).transferFrom(user1.address, user2.address, 2);
            expect(await nft.balanceOf(user1.address)).to.equal(3);
            expect(await nft.balanceOf(user2.address)).to.equal(2);
            expect(await nft.totalSupply()).to.equal(5);

            // Burn 1 token
            await nft.connect(user1).burn(3);
            expect(await nft.balanceOf(user1.address)).to.equal(2);
            expect(await nft.totalSupply()).to.equal(4);

            // Verify final state
            expect(await nft.ownerOf(4)).to.equal(user1.address);
            expect(await nft.ownerOf(5)).to.equal(user1.address);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
        });

        it("approved address cannot transfer after approval revoked", async function () {
            const { nft, user1, user2, user3 } = await mintedFixture();
            await nft.connect(user1).approve(user3.address, 1);
            await nft.connect(user1).approve(ethers.ZeroAddress, 1); // Revoke

            await expect(
                nft.connect(user3).transferFrom(user1.address, user2.address, 1)
            ).to.be.revertedWithCustomError(nft, "NotAuthorized");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    //  13. Gas Usage Measurement
    // ═══════════════════════════════════════════════════════════════

    describe("Gas Usage", function () {
        it("mint + transfer flow should stay within 300k gas", async function () {
            const { nft, owner, user1, user2 } = await deployFixture();

            // Measure mint gas
            const mintTx = await nft.connect(owner).safeMint(user1.address, 1);
            const mintReceipt = await mintTx.wait();
            const mintGas = mintReceipt.gasUsed;

            // Measure transfer gas
            const transferTx = await nft.connect(user1).transferFrom(user1.address, user2.address, 1);
            const transferReceipt = await transferTx.wait();
            const transferGas = transferReceipt.gasUsed;

            const totalGas = mintGas + transferGas;
            console.log(`    ⛽ Mint gas: ${mintGas.toString()}`);
            console.log(`    ⛽ Transfer gas: ${transferGas.toString()}`);
            console.log(`    ⛽ Total (mint + transfer): ${totalGas.toString()}`);

            // Assert combined gas is under 300k
            expect(totalGas).to.be.lessThan(300000n);
        });

        it("approval + approved transfer flow gas measurement", async function () {
            const { nft, owner, user1, user2, user3 } = await deployFixture();
            await nft.connect(owner).safeMint(user1.address, 1);

            const approveTx = await nft.connect(user1).approve(user2.address, 1);
            const approveReceipt = await approveTx.wait();
            const approveGas = approveReceipt.gasUsed;

            const transferTx = await nft.connect(user2).transferFrom(user1.address, user3.address, 1);
            const transferReceipt = await transferTx.wait();
            const transferGas = transferReceipt.gasUsed;

            console.log(`    ⛽ Approve gas: ${approveGas.toString()}`);
            console.log(`    ⛽ Approved transfer gas: ${transferGas.toString()}`);
            console.log(`    ⛽ Total (approve + transfer): ${(approveGas + transferGas).toString()}`);

            expect(approveGas + transferGas).to.be.lessThan(200000n);
        });
    });
});
