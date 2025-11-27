import { expect } from "chai";
import { ethers } from "hardhat";
import { DestinationFeedProxy } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * DestinationFeedProxy Test Suite
 * 
 * Tests the enhanced DestinationFeedProxy contract that:
 * - Inherits AbstractCallback for secure callback handling
 * - Validates feed source (originFeed)
 * - Validates decimals
 * - Validates message version
 * - Enforces monotonicity (roundId and updatedAt)
 * - Detects stale prices
 */
describe("DestinationFeedProxy", function () {
    let proxy: DestinationFeedProxy;
    let owner: SignerWithAddress;
    let callbackSender: SignerWithAddress;
    let rvmId: SignerWithAddress;
    let other: SignerWithAddress;

    // Configuration
    const DECIMALS = 8;
    const DESCRIPTION = "ETH / USD (Mirrored from Base Sepolia)";
    const ORIGIN_FEED = "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3"; // Base Sepolia Chainlink ETH/USD
    const MESSAGE_VERSION = 1;

    beforeEach(async function () {
        [owner, callbackSender, rvmId, other] = await ethers.getSigners();
        
        const ProxyFactory = await ethers.getContractFactory("DestinationFeedProxy");
        proxy = await ProxyFactory.deploy(
            callbackSender.address,  // _callback_sender (AbstractCallback)
            DECIMALS,                // _decimals
            DESCRIPTION,             // _description
            ORIGIN_FEED              // _expectedOriginFeed
        ) as unknown as DestinationFeedProxy;
    });

    describe("Deployment", function () {
        it("Should set correct decimals", async function () {
            expect(await proxy.decimals()).to.equal(DECIMALS);
        });

        it("Should set correct description", async function () {
            expect(await proxy.description()).to.equal(DESCRIPTION);
        });

        it("Should set version to 1", async function () {
            expect(await proxy.version()).to.equal(1);
        });

        it("Should set expected origin feed", async function () {
            expect(await proxy.expectedOriginFeed()).to.equal(ORIGIN_FEED);
        });

        it("Should set owner correctly", async function () {
            expect(await proxy.owner()).to.equal(owner.address);
        });

        it("Should set expected message version to 1", async function () {
            expect(await proxy.getExpectedMessageVersion()).to.equal(MESSAGE_VERSION);
        });
    });

    describe("AggregatorV3Interface", function () {
        it("Should revert latestRoundData when no data present", async function () {
            await expect(proxy.latestRoundData()).to.be.revertedWith("No data present");
        });

        it("Should revert getRoundData for non-existent round", async function () {
            await expect(proxy.getRoundData(1)).to.be.revertedWith("Round data not found");
        });
    });

    describe("Owner Functions", function () {
        it("Should allow owner to set authorized reactive contract", async function () {
            await expect(proxy.setAuthorizedReactiveContract(rvmId.address))
                .to.emit(proxy, "AuthorizedReactiveContractChanged")
                .withArgs(ethers.ZeroAddress, rvmId.address);

            expect(await proxy.authorizedReactiveContract()).to.equal(rvmId.address);
        });

        it("Should not allow non-owner to set authorized reactive contract", async function () {
            await expect(
                proxy.connect(other).setAuthorizedReactiveContract(other.address)
            ).to.be.revertedWith("Not authorized: only owner");
        });

        it("Should allow owner to update expected origin feed", async function () {
            const newFeed = ethers.Wallet.createRandom().address;
            await expect(proxy.setExpectedOriginFeed(newFeed))
                .to.emit(proxy, "ExpectedOriginFeedChanged")
                .withArgs(ORIGIN_FEED, newFeed);

            expect(await proxy.expectedOriginFeed()).to.equal(newFeed);
        });

        it("Should not allow non-owner to update expected origin feed", async function () {
            await expect(
                proxy.connect(other).setExpectedOriginFeed(other.address)
            ).to.be.revertedWith("Not authorized: only owner");
        });
    });

    describe("updateFromReactive - Security", function () {
        it("Should reject calls from unauthorized sender", async function () {
            await expect(
                proxy.connect(other).updateFromReactive(
                    rvmId.address,       // sender (RVM ID)
                    ORIGIN_FEED,         // originFeed
                    DECIMALS,            // decimals
                    MESSAGE_VERSION,     // messageVersion
                    1,                   // roundId
                    200000000000,        // answer ($2000.00)
                    1000,                // startedAt
                    1000,                // updatedAt
                    1                    // answeredInRound
                )
            ).to.be.revertedWith("Authorized sender only");
        });

        it("Should reject calls with wrong RVM ID when authorized contract is set", async function () {
            // Set authorized reactive contract
            await proxy.setAuthorizedReactiveContract(rvmId.address);

            // Call from callback sender but with wrong RVM ID
            // The rvmIdOnly modifier from AbstractCallback checks first
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    other.address,       // wrong sender (RVM ID)
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    1,
                    200000000000,
                    1000,
                    1000,
                    1
                )
            ).to.be.revertedWith("Authorized RVM ID only");
        });

        it("Should reject calls with invalid origin feed", async function () {
            const wrongFeed = ethers.Wallet.createRandom().address;

            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,       // RVM ID (owner deployed proxy, so rvm_id = owner)
                    wrongFeed,           // wrong origin feed
                    DECIMALS,
                    MESSAGE_VERSION,
                    1,
                    200000000000,
                    1000,
                    1000,
                    1
                )
            ).to.be.revertedWith("Invalid feed source");
        });

        it("Should reject calls with wrong message version", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    DECIMALS,
                    2,                   // wrong version
                    1,
                    200000000000,
                    1000,
                    1000,
                    1
                )
            ).to.be.revertedWith("Invalid message version");
        });

        it("Should reject calls with mismatched decimals", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    18,                  // wrong decimals
                    MESSAGE_VERSION,
                    1,
                    200000000000,
                    1000,
                    1000,
                    1
                )
            ).to.be.revertedWith("Decimals mismatch");
        });

        it("Should reject non-positive prices", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    1,
                    0,                   // invalid price (zero)
                    1000,
                    1000,
                    1
                )
            ).to.be.revertedWith("Invalid price: must be positive");

            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    1,
                    -100,                // invalid price (negative)
                    1000,
                    1000,
                    1
                )
            ).to.be.revertedWith("Invalid price: must be positive");
        });
    });

    describe("updateFromReactive - Valid Updates", function () {
        it("Should accept valid update and emit events", async function () {
            const roundId = 1;
            const answer = 200000000000n; // $2000.00 with 8 decimals
            const startedAt = 1000;
            const updatedAt = 1000;
            const answeredInRound = 1;

            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,       // RVM ID
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    roundId,
                    answer,
                    startedAt,
                    updatedAt,
                    answeredInRound
                )
            )
                .to.emit(proxy, "DebugCallback")
                .withArgs(owner.address, ORIGIN_FEED, DECIMALS, MESSAGE_VERSION)
                .to.emit(proxy, "FeedSourceVerified")
                .withArgs(ORIGIN_FEED, roundId)
                .to.emit(proxy, "FeedUpdated")
                .withArgs(roundId, answer, updatedAt);

            // Verify data was stored correctly
            const data = await proxy.latestRoundData();
            expect(data.roundId).to.equal(roundId);
            expect(data.answer).to.equal(answer);
            expect(data.startedAt).to.equal(startedAt);
            expect(data.updatedAt).to.equal(updatedAt);
            expect(data.answeredInRound).to.equal(answeredInRound);
        });

        it("Should allow getRoundData for stored round", async function () {
            const roundId = 5;
            const answer = 250000000000n;
            const startedAt = 2000;
            const updatedAt = 2000;
            const answeredInRound = 5;

            await proxy.connect(callbackSender).updateFromReactive(
                owner.address,
                ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                startedAt,
                updatedAt,
                answeredInRound
            );

            const data = await proxy.getRoundData(roundId);
            expect(data.roundId).to.equal(roundId);
            expect(data.answer).to.equal(answer);
        });

        it("Should skip origin feed validation when expectedOriginFeed is zero", async function () {
            // Set expected origin feed to zero address
            await proxy.setExpectedOriginFeed(ethers.ZeroAddress);

            const randomFeed = ethers.Wallet.createRandom().address;

            // Should accept any feed
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    randomFeed,          // any origin feed
                    DECIMALS,
                    MESSAGE_VERSION,
                    1,
                    200000000000,
                    1000,
                    1000,
                    1
                )
            ).to.emit(proxy, "FeedSourceVerified");
        });
    });

    describe("Monotonicity Enforcement", function () {
        beforeEach(async function () {
            // Setup initial update
            await proxy.connect(callbackSender).updateFromReactive(
                owner.address,
                ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                10,              // roundId = 10
                200000000000,    // answer
                1000,            // startedAt
                1000,            // updatedAt
                10               // answeredInRound
            );
        });

        it("Should reject stale roundId (regression)", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    9,               // older roundId
                    210000000000,
                    1100,
                    1100,
                    9
                )
            ).to.be.revertedWith("Stale update: roundId regression");
        });

        it("Should reject same roundId (regression)", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    10,              // same roundId
                    210000000000,
                    1100,
                    1100,
                    10
                )
            ).to.be.revertedWith("Stale update: roundId regression");
        });

        it("Should reject stale updatedAt (regression)", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    11,              // newer roundId
                    210000000000,
                    900,             // startedAt
                    900,             // older updatedAt
                    11
                )
            ).to.be.revertedWith("Stale update: updatedAt regression");
        });

        it("Should accept valid sequential updates", async function () {
            // Update to round 11
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    11,
                    210000000000,
                    1100,
                    1100,
                    11
                )
            ).to.emit(proxy, "FeedUpdated");

            // Update to round 12
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    owner.address,
                    ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    12,
                    220000000000,
                    1200,
                    1200,
                    12
                )
            ).to.emit(proxy, "FeedUpdated");

            const data = await proxy.latestRoundData();
            expect(data.roundId).to.equal(12);
            expect(data.answer).to.equal(220000000000);
        });
    });

    describe("Stale Price Detection", function () {
        it("Should report isStale correctly", async function () {
            // Initially no data - but isStale would be true since updatedAt = 0
            // After update, check stale status
            const currentBlock = await ethers.provider.getBlock("latest");
            const currentTime = currentBlock!.timestamp;

            await proxy.connect(callbackSender).updateFromReactive(
                owner.address,
                ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                1,
                200000000000,
                currentTime,
                currentTime,
                1
            );

            // Should not be stale immediately
            expect(await proxy.isStale()).to.equal(false);
        });

        it("Should detect stale data after threshold", async function () {
            // Get current time
            const currentBlock = await ethers.provider.getBlock("latest");
            const currentTime = currentBlock!.timestamp;
            
            // Set data with old timestamp (more than 3 hours ago)
            const staleTime = currentTime - (4 * 60 * 60); // 4 hours ago

            await proxy.connect(callbackSender).updateFromReactive(
                owner.address,
                ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                1,
                200000000000,
                staleTime,
                staleTime,
                1
            );

            // Should be stale
            expect(await proxy.isStale()).to.equal(true);
        });
    });

    describe("Fund Management", function () {
        it("Should allow owner to withdraw funds", async function () {
            // Fund the contract
            await owner.sendTransaction({
                to: await proxy.getAddress(),
                value: ethers.parseEther("0.1")
            });

            const balanceBefore = await ethers.provider.getBalance(other.address);
            
            await proxy.withdrawFunds(other.address);
            
            const balanceAfter = await ethers.provider.getBalance(other.address);
            expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("0.1"));
        });

        it("Should revert withdrawal with no funds", async function () {
            await expect(
                proxy.withdrawFunds(owner.address)
            ).to.be.revertedWith("No funds to withdraw");
        });

        it("Should not allow non-owner to withdraw", async function () {
            await owner.sendTransaction({
                to: await proxy.getAddress(),
                value: ethers.parseEther("0.1")
            });

            await expect(
                proxy.connect(other).withdrawFunds(other.address)
            ).to.be.revertedWith("Not authorized: only owner");
        });
    });
});
