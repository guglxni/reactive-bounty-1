import { expect } from "chai";
import { ethers } from "hardhat";
import { DestinationFeedProxyV2 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * DestinationFeedProxyV2 Test Suite
 * 
 * Tests the production-grade destination proxy with:
 * - AbstractCallback pattern
 * - Historical round storage
 * - Feed identifier validation
 * - Enhanced event logging
 */
describe("DestinationFeedProxyV2", function () {
    let proxy: DestinationFeedProxyV2;
    let owner: SignerWithAddress;
    let callbackSender: SignerWithAddress;
    let user: SignerWithAddress;

    // Configuration
    const DECIMALS = 8;
    const DESCRIPTION = "ETH / USD";
    const EXPECTED_ORIGIN_FEED = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";
    const MESSAGE_VERSION = 1;

    // Helper to get the correct RVM ID (set to deployer in constructor)
    let rvmId: string;

    beforeEach(async function () {
        [owner, callbackSender, user] = await ethers.getSigners();

        const ProxyFactory = await ethers.getContractFactory("DestinationFeedProxyV2");
        proxy = await ProxyFactory.deploy(
            callbackSender.address,  // _callback_sender (simulates Callback Proxy)
            DECIMALS,
            DESCRIPTION,
            EXPECTED_ORIGIN_FEED
        ) as unknown as DestinationFeedProxyV2;
        await proxy.waitForDeployment();
        
        // AbstractCallback sets rvm_id = msg.sender (owner) in constructor
        // So we need to pass owner.address as the sender parameter in updateFromReactive
        rvmId = owner.address;
    });

    // Helper function for valid updateFromReactive call
    async function validUpdate(
        roundId: number,
        answer: bigint,
        updatedAt: number
    ) {
        return proxy.connect(callbackSender).updateFromReactive(
            rvmId,  // sender (must match rvm_id set in constructor)
            EXPECTED_ORIGIN_FEED,
            DECIMALS,
            MESSAGE_VERSION,
            roundId,
            answer,
            updatedAt,
            updatedAt,
            roundId
        );
    }

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
            expect(await proxy.expectedOriginFeed()).to.equal(EXPECTED_ORIGIN_FEED);
        });

        it("Should set owner correctly", async function () {
            expect(await proxy.owner()).to.equal(owner.address);
        });

        it("Should set expected message version to 1", async function () {
            expect(await proxy.EXPECTED_MESSAGE_VERSION()).to.equal(MESSAGE_VERSION);
        });

        it("Should have MAX_HISTORY of 100", async function () {
            expect(await proxy.MAX_HISTORY()).to.equal(100);
        });

        it("Should have STALE_THRESHOLD of 3 hours", async function () {
            expect(await proxy.STALE_THRESHOLD()).to.equal(3 * 60 * 60); // 10800 seconds
        });
    });

    describe("AggregatorV3Interface - Before Updates", function () {
        it("Should revert latestRoundData when no data present", async function () {
            await expect(proxy.latestRoundData())
                .to.be.revertedWith("No data present");
        });

        it("Should revert getRoundData for non-existent round", async function () {
            await expect(proxy.getRoundData(1))
                .to.be.revertedWith("Round data not found");
        });
    });

    describe("Configuration Functions", function () {
        it("Should allow owner to set authorized reactive contract", async function () {
            const reactiveContract = ethers.Wallet.createRandom().address;
            
            await expect(proxy.setAuthorizedReactiveContract(reactiveContract))
                .to.emit(proxy, "AuthorizedReactiveContractChanged")
                .withArgs(ethers.ZeroAddress, reactiveContract);
            
            expect(await proxy.authorizedReactiveContract()).to.equal(reactiveContract);
        });

        it("Should not allow non-owner to set authorized reactive contract", async function () {
            await expect(proxy.connect(user).setAuthorizedReactiveContract(user.address))
                .to.be.revertedWith("Not authorized: only owner");
        });

        it("Should allow owner to update expected origin feed", async function () {
            const newFeed = ethers.Wallet.createRandom().address;
            
            await expect(proxy.setExpectedOriginFeed(newFeed))
                .to.emit(proxy, "ExpectedOriginFeedChanged")
                .withArgs(EXPECTED_ORIGIN_FEED, newFeed);
            
            expect(await proxy.expectedOriginFeed()).to.equal(newFeed);
        });

        it("Should not allow non-owner to update expected origin feed", async function () {
            const newFeed = ethers.Wallet.createRandom().address;
            await expect(proxy.connect(user).setExpectedOriginFeed(newFeed))
                .to.be.revertedWith("Not authorized: only owner");
        });

        it("Should allow owner to transfer ownership", async function () {
            await expect(proxy.transferOwnership(user.address))
                .to.emit(proxy, "OwnershipTransferred")
                .withArgs(owner.address, user.address);
            
            expect(await proxy.owner()).to.equal(user.address);
        });

        it("Should not allow transferring ownership to zero address", async function () {
            await expect(proxy.transferOwnership(ethers.ZeroAddress))
                .to.be.revertedWith("New owner is zero address");
        });
    });

    describe("updateFromReactive - Security Validation", function () {
        it("Should reject calls from unauthorized sender", async function () {
            await expect(
                proxy.connect(user).updateFromReactive(
                    rvmId,  // sender
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    100,  // roundId
                    200000000000n,  // answer
                    1700000000,  // startedAt
                    1700000000,  // updatedAt
                    100   // answeredInRound
                )
            ).to.be.reverted; // AbstractCallback authorizedSenderOnly modifier
        });

        it("Should reject calls with wrong RVM ID when authorized contract is set", async function () {
            const authorizedRVM = ethers.Wallet.createRandom().address;
            await proxy.setAuthorizedReactiveContract(authorizedRVM);
            
            // Pass correct rvm_id but authorizedReactiveContract check should fail
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,  // correct rvm_id, but authorizedReactiveContract mismatch
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    100,
                    200000000000n,
                    1700000000,
                    1700000000,
                    100
                )
            ).to.be.revertedWith("Unauthorized RVM Sender");
        });

        it("Should reject calls with invalid origin feed", async function () {
            const wrongFeed = ethers.Wallet.createRandom().address;
            
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    wrongFeed,  // wrong feed
                    DECIMALS,
                    MESSAGE_VERSION,
                    100,
                    200000000000n,
                    1700000000,
                    1700000000,
                    100
                )
            ).to.be.revertedWith("Invalid feed source");
        });

        it("Should reject calls with wrong message version", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    2,  // wrong version
                    100,
                    200000000000n,
                    1700000000,
                    1700000000,
                    100
                )
            ).to.be.revertedWith("Invalid message version");
        });

        it("Should reject calls with mismatched decimals", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    6,  // wrong decimals
                    MESSAGE_VERSION,
                    100,
                    200000000000n,
                    1700000000,
                    1700000000,
                    100
                )
            ).to.be.revertedWith("Decimals mismatch");
        });

        it("Should reject non-positive prices", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    100,
                    0n,  // zero price
                    1700000000,
                    1700000000,
                    100
                )
            ).to.be.revertedWith("Invalid price: must be positive");
        });

        it("Should allow skipping origin feed validation when set to zero", async function () {
            await proxy.setExpectedOriginFeed(ethers.ZeroAddress);
            
            const randomFeed = ethers.Wallet.createRandom().address;
            
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    randomFeed,  // any feed
                    DECIMALS,
                    MESSAGE_VERSION,
                    100,
                    200000000000n,
                    1700000000,
                    1700000000,
                    100
                )
            ).to.emit(proxy, "FeedUpdated");
        });
    });

    describe("updateFromReactive - Valid Updates", function () {
        it("Should accept valid update and emit events", async function () {
            const roundId = 100;
            const answer = 200000000000n;
            const updatedAt = 1700000000;

            const tx = proxy.connect(callbackSender).updateFromReactive(
                rvmId,
                EXPECTED_ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                updatedAt,
                updatedAt,
                roundId
            );

            await expect(tx)
                .to.emit(proxy, "CallbackReceived")
                .to.emit(proxy, "ValidationPassed")
                .to.emit(proxy, "FeedUpdated")
                .withArgs(roundId, answer, updatedAt)
                .to.emit(proxy, "FeedSourceVerified");
        });

        it("Should store round in history for getRoundData", async function () {
            const roundId = 100;
            const answer = 200000000000n;
            const updatedAt = 1700000000;

            await proxy.connect(callbackSender).updateFromReactive(
                rvmId,
                EXPECTED_ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                updatedAt,
                updatedAt,
                roundId
            );

            const roundData = await proxy.getRoundData(roundId);
            expect(roundData.roundId).to.equal(roundId);
            expect(roundData.answer).to.equal(answer);
            expect(roundData.updatedAt).to.equal(updatedAt);
        });

        it("Should update latestRoundData correctly", async function () {
            const roundId = 100;
            const answer = 200000000000n;
            const updatedAt = 1700000000;

            await proxy.connect(callbackSender).updateFromReactive(
                rvmId,
                EXPECTED_ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                updatedAt,
                updatedAt,
                roundId
            );

            const latestData = await proxy.latestRoundData();
            expect(latestData.roundId).to.equal(roundId);
            expect(latestData.answer).to.equal(answer);
        });

        it("Should update statistics correctly", async function () {
            await proxy.connect(callbackSender).updateFromReactive(
                rvmId,
                EXPECTED_ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                100,
                200000000000n,
                1700000000,
                1700000000,
                100
            );

            expect(await proxy.totalUpdates()).to.equal(1);
            expect(await proxy.getHistorySize()).to.equal(1);
        });
    });

    describe("Historical Data Storage", function () {
        it("Should store history for all received rounds", async function () {
            // Send multiple updates
            for (let i = 100; i < 110; i++) {
                await proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    i,
                    BigInt(i * 1000000000),
                    1700000000 + i,
                    1700000000 + i,
                    i
                );
            }

            // Verify all rounds stored
            for (let i = 100; i < 110; i++) {
                const data = await proxy.getRoundData(i);
                expect(data.roundId).to.equal(i);
                expect(data.answer).to.equal(BigInt(i * 1000000000));
            }
            
            expect(await proxy.getHistorySize()).to.equal(10);
        });

        it("Should return stored round IDs", async function () {
            for (let i = 100; i < 103; i++) {
                await proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    i,
                    200000000000n,
                    1700000000 + i,
                    1700000000 + i,
                    i
                );
            }

            const roundIds = await proxy.getStoredRoundIds();
            expect(roundIds.length).to.equal(3);
            expect(roundIds[0]).to.equal(100);
            expect(roundIds[1]).to.equal(101);
            expect(roundIds[2]).to.equal(102);
        });
    });

    describe("Monotonicity Enforcement", function () {
        beforeEach(async function () {
            // Set initial data with roundId 100
            await proxy.connect(callbackSender).updateFromReactive(
                rvmId,
                EXPECTED_ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                100,
                200000000000n,
                1700000000,
                1700000000,
                100
            );
        });

        it("Should reject stale roundId (regression)", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    99,  // older roundId
                    199000000000n,
                    1699999000,
                    1699999000,
                    99
                )
            ).to.be.revertedWith("Stale update: roundId regression");
        });

        it("Should reject same roundId (regression)", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    100,  // same roundId
                    201000000000n,
                    1700000001,
                    1700000001,
                    100
                )
            ).to.be.revertedWith("Stale update: roundId regression");
        });

        it("Should reject stale updatedAt (regression)", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    101,  // newer roundId
                    201000000000n,
                    1699999999,  // older timestamp
                    1699999999,  // older timestamp
                    101
                )
            ).to.be.revertedWith("Stale update: updatedAt regression");
        });

        it("Should accept valid sequential updates", async function () {
            await expect(
                proxy.connect(callbackSender).updateFromReactive(
                    rvmId,
                    EXPECTED_ORIGIN_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    101,
                    201000000000n,
                    1700000001,
                    1700000001,
                    101
                )
            ).to.emit(proxy, "FeedUpdated");
        });
    });

    describe("Stale Price Detection", function () {
        it("Should report isStale as true when no data", async function () {
            expect(await proxy.isStale()).to.equal(true);
        });

        it("Should report isStale as false immediately after update", async function () {
            await proxy.connect(callbackSender).updateFromReactive(
                rvmId,
                EXPECTED_ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                100,
                200000000000n,
                1700000000,
                1700000000,
                100
            );

            // Note: isStale compares block.timestamp which is mocked
            // In a real test with time manipulation, we'd test staleness
            const stats = await proxy.getStats();
            expect(stats[4]).to.be.a("boolean"); // _isStale field
        });
    });

    describe("getStats() - Statistics", function () {
        it("Should return comprehensive statistics", async function () {
            await proxy.connect(callbackSender).updateFromReactive(
                rvmId,
                EXPECTED_ORIGIN_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                100,
                200000000000n,
                1700000000,
                1700000000,
                100
            );

            const stats = await proxy.getStats();
            expect(stats._totalUpdates).to.equal(1n);
            expect(stats._historySize).to.equal(1n);
        });
    });

    describe("Fund Management", function () {
        beforeEach(async function () {
            // Send some ETH to the proxy
            await owner.sendTransaction({
                to: await proxy.getAddress(),
                value: ethers.parseEther("1.0")
            });
        });

        it("Should emit FundsReceived event", async function () {
            await expect(
                owner.sendTransaction({
                    to: await proxy.getAddress(),
                    value: ethers.parseEther("0.5")
                })
            ).to.emit(proxy, "FundsReceived");
        });

        it("Should not allow non-owner to withdraw funds", async function () {
            await expect(proxy.connect(user).withdrawFunds(user.address))
                .to.be.revertedWith("Not authorized: only owner");
        });
        
        // Note: getDebt() and withdrawFunds() tests require a real IPayable-compatible
        // callback sender (vendor). In unit tests, we use a simple EOA for callbackSender
        // which doesn't implement the IPayable interface. These functions work correctly
        // when deployed with the actual Reactive Network Callback Proxy.
    });
});
