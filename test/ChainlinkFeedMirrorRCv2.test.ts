import { expect } from "chai";
import { ethers } from "hardhat";
import { ChainlinkFeedMirrorRCv2 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * ChainlinkFeedMirrorRCv2 Test Suite
 * 
 * Tests the production-grade Reactive Smart Contract with:
 * - AbstractPausableReactive pattern
 * - Callback confirmation tracking
 * - Enhanced event logging
 * - op_code validation
 */
describe("ChainlinkFeedMirrorRCv2", function () {
    let rsc: ChainlinkFeedMirrorRCv2;
    let deployer: SignerWithAddress;
    let service: SignerWithAddress;
    let other: SignerWithAddress;

    // Configuration
    const ORIGIN_CHAIN_ID = 84532; // Base Sepolia
    const DEST_CHAIN_ID = 11155111; // Ethereum Sepolia
    const ORIGIN_FEED = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";
    const ORIGIN_DECIMALS = 8;
    const MESSAGE_VERSION = 1;
    const CALLBACK_GAS_LIMIT = 1000000n;

    // Topic constants
    const ANSWER_UPDATED_TOPIC_0 = "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";
    const FEED_UPDATED_TOPIC_0 = "0x061350823c4e78d9e58da7dc55e74186fc9e3a1fd6adf26ae5ffbe26f73e4f09";

    let destProxy: string;

    beforeEach(async function () {
        [deployer, service, other] = await ethers.getSigners();
        destProxy = ethers.Wallet.createRandom().address;

        const RSCFactory = await ethers.getContractFactory("ChainlinkFeedMirrorRCv2");
        
        rsc = await RSCFactory.deploy(
            service.address,     // _service
            ORIGIN_CHAIN_ID,     // _originChainId
            DEST_CHAIN_ID,       // _destinationChainId
            ORIGIN_FEED,         // _originFeed
            destProxy,           // _destinationProxy
            ORIGIN_DECIMALS      // _originDecimals
        );
        await rsc.waitForDeployment();
    });

    /**
     * Helper to create a LogRecord structure matching IReactive.LogRecord
     */
    function createLogRecord(
        answer: bigint,
        roundId: bigint,
        updatedAt: bigint,
        topic0: string = ANSWER_UPDATED_TOPIC_0,
        contractAddr: string = ORIGIN_FEED,
        opCode: number = 3 // LOG3 for AnswerUpdated
    ) {
        return {
            chain_id: BigInt(ORIGIN_CHAIN_ID),
            _contract: contractAddr,
            topic_0: BigInt(topic0),
            topic_1: answer,           // int256 current (indexed)
            topic_2: roundId,          // uint256 roundId (indexed)
            topic_3: 0n,               // unused
            data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [updatedAt]),
            block_number: 1000n,
            op_code: BigInt(opCode),
            block_hash: BigInt(ethers.keccak256(ethers.toUtf8Bytes("block"))),
            tx_hash: BigInt(ethers.keccak256(ethers.toUtf8Bytes("tx"))),
            log_index: 0n
        };
    }

    describe("Deployment", function () {
        it("Should set origin chain ID correctly", async function () {
            expect(await rsc.originChainId()).to.equal(ORIGIN_CHAIN_ID);
        });

        it("Should set destination chain ID correctly", async function () {
            expect(await rsc.destinationChainId()).to.equal(DEST_CHAIN_ID);
        });

        it("Should set origin feed correctly", async function () {
            expect(await rsc.originFeed()).to.equal(ORIGIN_FEED);
        });

        it("Should set destination proxy correctly", async function () {
            expect(await rsc.destinationProxy()).to.equal(destProxy);
        });

        it("Should set origin decimals correctly", async function () {
            expect(await rsc.originDecimals()).to.equal(ORIGIN_DECIMALS);
        });

        it("Should have MESSAGE_VERSION of 1", async function () {
            expect(await rsc.MESSAGE_VERSION()).to.equal(MESSAGE_VERSION);
        });

        it("Should have non-zero DOMAIN_SEPARATOR", async function () {
            const domainSeparator = await rsc.getDomainSeparator();
            expect(domainSeparator).to.not.equal(ethers.ZeroHash);
        });

        it("Should set owner correctly", async function () {
            expect(await rsc.getOwner()).to.equal(deployer.address);
        });

        it("Should not be paused initially", async function () {
            expect(await rsc.isPaused()).to.equal(false);
        });

        it("Should initialize callback statistics to 0", async function () {
            const stats = await rsc.getCallbackStats();
            expect(stats[0]).to.equal(0n); // totalSent
            expect(stats[1]).to.equal(0n); // confirmed
            expect(stats[2]).to.equal(0n); // pending
            expect(stats[3]).to.equal(0n); // confirmationRate
        });
    });

    describe("Topic Constants", function () {
        it("Should have correct ANSWER_UPDATED_TOPIC_0", async function () {
            expect(await rsc.ANSWER_UPDATED_TOPIC_0()).to.equal(ANSWER_UPDATED_TOPIC_0);
        });

        it("Should have correct FEED_UPDATED_TOPIC_0", async function () {
            expect(await rsc.FEED_UPDATED_TOPIC_0()).to.equal(FEED_UPDATED_TOPIC_0);
        });

        it("Should have CALLBACK_GAS_LIMIT of 1000000", async function () {
            expect(await rsc.CALLBACK_GAS_LIMIT()).to.equal(CALLBACK_GAS_LIMIT);
        });
    });

    describe("react() - AnswerUpdated Event Handling", function () {
        it("Should emit MirrorTriggered event on valid log", async function () {
            const answer = 200000000000n; // $2000.00 with 8 decimals
            const roundId = 1n;
            const updatedAt = 1700000000n;

            const log = createLogRecord(answer, roundId, updatedAt);

            await expect(rsc.connect(service).react(log))
                .to.emit(rsc, "MirrorTriggered")
                .withArgs(roundId, answer, updatedAt, ORIGIN_FEED);
        });

        it("Should emit CallbackSent event with correct data", async function () {
            const answer = 200000000000n;
            const roundId = 1n;
            const updatedAt = 1700000000n;

            const log = createLogRecord(answer, roundId, updatedAt);

            await expect(rsc.connect(service).react(log))
                .to.emit(rsc, "CallbackSent")
                .withArgs(roundId, answer, destProxy, CALLBACK_GAS_LIMIT);
        });

        it("Should emit CallbackPending event", async function () {
            const answer = 200000000000n;
            const roundId = 1n;
            const updatedAt = 1700000000n;

            const log = createLogRecord(answer, roundId, updatedAt);

            await expect(rsc.connect(service).react(log))
                .to.emit(rsc, "CallbackPending")
                .withArgs(roundId);
        });

        it("Should update callback statistics after processing", async function () {
            const log = createLogRecord(200000000000n, 5n, 1700000000n);

            await rsc.connect(service).react(log);

            const stats = await rsc.getCallbackStats();
            expect(stats[0]).to.equal(1n); // totalSent
            expect(stats[2]).to.equal(1n); // pending
        });

        it("Should update lastForwardedRoundId after processing", async function () {
            const log = createLogRecord(200000000000n, 5n, 1700000000n);

            await rsc.connect(service).react(log);

            expect(await rsc.lastForwardedRoundId()).to.equal(5);
        });

        it("Should skip duplicate round IDs (deduplication)", async function () {
            const log1 = createLogRecord(200000000000n, 10n, 1700000000n);
            const log2 = createLogRecord(210000000000n, 10n, 1700000100n); // same roundId

            // First should emit Callback
            await expect(rsc.connect(service).react(log1))
                .to.emit(rsc, "Callback");

            // Second with same roundId should emit DuplicateRoundSkipped
            await expect(rsc.connect(service).react(log2))
                .to.emit(rsc, "DuplicateRoundSkipped")
                .withArgs(10n);
        });

        it("Should skip older round IDs", async function () {
            const log1 = createLogRecord(200000000000n, 10n, 1700000000n);
            const log2 = createLogRecord(190000000000n, 9n, 1699999000n); // older roundId

            await rsc.connect(service).react(log1);
            
            // Older round should emit DuplicateRoundSkipped
            await expect(rsc.connect(service).react(log2))
                .to.emit(rsc, "DuplicateRoundSkipped")
                .withArgs(9n);
        });

        it("Should emit InvalidOpCodeReceived for non-LOG3 events", async function () {
            const answer = 200000000000n;
            const roundId = 1n;
            const updatedAt = 1700000000n;

            // Create log with wrong op_code
            const log = createLogRecord(answer, roundId, updatedAt, ANSWER_UPDATED_TOPIC_0, ORIGIN_FEED, 2); // LOG2 instead of LOG3

            // Should still process but emit warning
            await expect(rsc.connect(service).react(log))
                .to.emit(rsc, "InvalidOpCodeReceived")
                .withArgs(2n, 3n);
        });

        it("Should process sequential round IDs correctly", async function () {
            for (let i = 1n; i <= 5n; i++) {
                const log = createLogRecord(
                    200000000000n + (i * 1000000000n),
                    i,
                    1700000000n + (i * 100n)
                );

                await expect(rsc.connect(service).react(log))
                    .to.emit(rsc, "Callback");
            }

            expect(await rsc.lastForwardedRoundId()).to.equal(5);
            
            const stats = await rsc.getCallbackStats();
            expect(stats[0]).to.equal(5n); // 5 callbacks sent
        });
    });

    describe("react() - Confirmation Handling", function () {
        it("Should track pending callbacks", async function () {
            const roundId = 100n;
            const log = createLogRecord(200000000000n, roundId, 1700000000n);

            await rsc.connect(service).react(log);

            expect(await rsc.isCallbackPending(roundId)).to.equal(true);
        });

        it("Should process FeedUpdated confirmation events", async function () {
            // First, send a price update to create pending callback
            const roundId = 100n;
            const answer = 200000000000n;
            const priceLog = createLogRecord(answer, roundId, 1700000000n);
            await rsc.connect(service).react(priceLog);

            expect(await rsc.isCallbackPending(roundId)).to.equal(true);

            // Now send confirmation from destination
            const confirmLog = {
                chain_id: BigInt(DEST_CHAIN_ID),
                _contract: destProxy,
                topic_0: BigInt(FEED_UPDATED_TOPIC_0),
                topic_1: roundId,  // roundId is indexed
                topic_2: 0n,
                topic_3: 0n,
                data: ethers.AbiCoder.defaultAbiCoder().encode(["int256", "uint256"], [answer, 1700000000n]),
                block_number: 2000n,
                op_code: 2n, // LOG2 for FeedUpdated
                block_hash: BigInt(ethers.keccak256(ethers.toUtf8Bytes("block2"))),
                tx_hash: BigInt(ethers.keccak256(ethers.toUtf8Bytes("tx2"))),
                log_index: 0n
            };

            await expect(rsc.connect(service).react(confirmLog))
                .to.emit(rsc, "CallbackConfirmed");

            expect(await rsc.isCallbackPending(roundId)).to.equal(false);
            
            const stats = await rsc.getCallbackStats();
            expect(stats[1]).to.equal(1n); // confirmed
            expect(stats[2]).to.equal(0n); // pending
        });

        it("Should calculate confirmation rate correctly", async function () {
            // Send 3 price updates
            for (let i = 1n; i <= 3n; i++) {
                const log = createLogRecord(200000000000n + i, i, 1700000000n + i);
                await rsc.connect(service).react(log);
            }

            // Confirm 2 of them
            for (let i = 1n; i <= 2n; i++) {
                const confirmLog = {
                    chain_id: BigInt(DEST_CHAIN_ID),
                    _contract: destProxy,
                    topic_0: BigInt(FEED_UPDATED_TOPIC_0),
                    topic_1: i,
                    topic_2: 0n,
                    topic_3: 0n,
                    data: ethers.AbiCoder.defaultAbiCoder().encode(["int256", "uint256"], [200000000000n + i, 1700000000n + i]),
                    block_number: 2000n + i,
                    op_code: 2n,
                    block_hash: BigInt(ethers.keccak256(ethers.toUtf8Bytes(`block${i}`))),
                    tx_hash: BigInt(ethers.keccak256(ethers.toUtf8Bytes(`tx${i}`))),
                    log_index: 0n
                };
                await rsc.connect(service).react(confirmLog);
            }

            const stats = await rsc.getCallbackStats();
            expect(stats[0]).to.equal(3n); // totalSent
            expect(stats[1]).to.equal(2n); // confirmed
            expect(stats[2]).to.equal(1n); // pending
            // Confirmation rate: (2 * 10000) / 3 = 6666 basis points
            expect(stats[3]).to.equal(6666n);
        });
    });

    describe("forceUpdate() - Manual Trigger", function () {
        it("Should emit Callback with correct payload on forceUpdate", async function () {
            const roundId = 100;
            const answer = 250000000000n;
            const updatedAt = 1700000000;

            await expect(rsc.forceUpdate(roundId, answer, updatedAt))
                .to.emit(rsc, "Callback");
        });

        it("Should emit CallbackSent on forceUpdate", async function () {
            const roundId = 100n;
            const answer = 250000000000n;
            const updatedAt = 1700000000;

            await expect(rsc.forceUpdate(roundId, answer, updatedAt))
                .to.emit(rsc, "CallbackSent")
                .withArgs(roundId, answer, destProxy, CALLBACK_GAS_LIMIT);
        });

        it("Should increment totalCallbacksSent on forceUpdate", async function () {
            await rsc.forceUpdate(1, 200000000000, 1700000000);
            
            const stats = await rsc.getCallbackStats();
            expect(stats[0]).to.equal(1n);
        });

        it("Should allow anyone to call forceUpdate", async function () {
            await expect(rsc.connect(other).forceUpdate(1, 200000000000, 1700000000))
                .to.emit(rsc, "Callback");
        });

        it("Should accept ETH with forceUpdate", async function () {
            await expect(
                rsc.forceUpdate(1, 200000000000, 1700000000, { value: ethers.parseEther("0.01") })
            ).to.emit(rsc, "Callback");
        });
    });

    describe("View Functions", function () {
        it("Should return correct domain separator", async function () {
            const domainSeparator = await rsc.getDomainSeparator();
            expect(domainSeparator.length).to.equal(66); // 0x + 64 hex chars
        });

        it("Should return correct owner", async function () {
            expect(await rsc.getOwner()).to.equal(deployer.address);
        });

        it("Should return correct paused state", async function () {
            expect(await rsc.isPaused()).to.equal(false);
        });

        it("Should return callback pending status correctly", async function () {
            expect(await rsc.isCallbackPending(999)).to.equal(false);
            
            const log = createLogRecord(200000000000n, 999n, 1700000000n);
            await rsc.connect(service).react(log);
            
            expect(await rsc.isCallbackPending(999)).to.equal(true);
        });
    });
});
