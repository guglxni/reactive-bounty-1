import { expect } from "chai";
import { ethers } from "hardhat";
import { ChainlinkFeedMirrorCronRC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * ChainlinkFeedMirrorCronRC Test Suite
 * 
 * Tests the dual-mode Reactive Smart Contract that:
 * - Event-driven: Subscribes to Chainlink AnswerUpdated events
 * - Cron-based: Subscribes to Cron100 heartbeat for periodic backup
 * - Supports pause/resume via AbstractPausableReactive
 * - Tracks statistics (event vs cron trigger counts)
 */
describe("ChainlinkFeedMirrorCronRC", function () {
    let rc: ChainlinkFeedMirrorCronRC;
    let deployer: SignerWithAddress;
    let service: SignerWithAddress;
    let other: SignerWithAddress;

    // Configuration
    const ORIGIN_CHAIN_ID = 84532; // Base Sepolia
    const DEST_CHAIN_ID = 11155111; // Ethereum Sepolia
    const ORIGIN_FEED = "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3";
    const ORIGIN_DECIMALS = 8;
    const MESSAGE_VERSION = 1;
    const CALLBACK_GAS_LIMIT = 1000000n;

    // Topic constants
    const ANSWER_UPDATED_TOPIC_0 = "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";
    const CRON_TOPIC = "0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70";

    let destProxy: string;

    beforeEach(async function () {
        [deployer, service, other] = await ethers.getSigners();
        destProxy = ethers.Wallet.createRandom().address;

        const RCFactory = await ethers.getContractFactory("ChainlinkFeedMirrorCronRC");
        
        rc = await RCFactory.deploy(
            service.address,     // _service
            ORIGIN_CHAIN_ID,     // _originChainId
            DEST_CHAIN_ID,       // _destinationChainId
            ORIGIN_FEED,         // _originFeed
            destProxy,           // _destinationProxy
            ORIGIN_DECIMALS      // _originDecimals
        );
    });

    describe("Deployment", function () {
        it("Should set origin chain ID correctly", async function () {
            expect(await rc.originChainId()).to.equal(ORIGIN_CHAIN_ID);
        });

        it("Should set destination chain ID correctly", async function () {
            expect(await rc.destinationChainId()).to.equal(DEST_CHAIN_ID);
        });

        it("Should set origin feed correctly", async function () {
            expect(await rc.originFeed()).to.equal(ORIGIN_FEED);
        });

        it("Should set destination proxy correctly", async function () {
            expect(await rc.destinationProxy()).to.equal(destProxy);
        });

        it("Should set origin decimals correctly", async function () {
            expect(await rc.originDecimals()).to.equal(ORIGIN_DECIMALS);
        });

        it("Should have MESSAGE_VERSION of 1", async function () {
            expect(await rc.MESSAGE_VERSION()).to.equal(MESSAGE_VERSION);
        });

        it("Should have non-zero DOMAIN_SEPARATOR", async function () {
            const domainSeparator = await rc.getDomainSeparator();
            expect(domainSeparator).to.not.equal(ethers.ZeroHash);
        });

        it("Should initialize statistics to 0", async function () {
            const stats = await rc.getStats();
            expect(stats.lastRound).to.equal(0);
            expect(stats.lastCron).to.equal(0);
            expect(stats.cronCount).to.equal(0);
            expect(stats.eventCount).to.equal(0);
        });
    });

    describe("Topic Constants", function () {
        it("Should have correct ANSWER_UPDATED_TOPIC_0", async function () {
            expect(await rc.ANSWER_UPDATED_TOPIC_0()).to.equal(
                "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f"
            );
        });

        it("Should have correct CRON_TOPIC", async function () {
            expect(await rc.CRON_TOPIC()).to.equal(
                "0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70"
            );
        });

        it("Should have CALLBACK_GAS_LIMIT of 1000000", async function () {
            expect(await rc.CALLBACK_GAS_LIMIT()).to.equal(1000000);
        });
    });

    describe("react() - Event Mode (AnswerUpdated)", function () {
        function createPriceLog(
            answer: bigint,
            roundId: bigint,
            updatedAt: bigint
        ) {
            return {
                chain_id: ORIGIN_CHAIN_ID,
                _contract: ORIGIN_FEED,
                topic_0: ANSWER_UPDATED_TOPIC_0,
                topic_1: answer,
                topic_2: roundId,
                topic_3: 0n,
                data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [updatedAt]),
                block_number: 1000,
                op_code: 1,
                block_hash: ethers.keccak256(ethers.toUtf8Bytes("block")),
                tx_hash: ethers.keccak256(ethers.toUtf8Bytes("tx")),
                log_index: 0
            };
        }

        it("Should emit MirrorTriggered with 'EVENT' trigger type", async function () {
            const answer = 200000000000n;
            const roundId = 1n;
            const updatedAt = 1700000000n;

            const log = createPriceLog(answer, roundId, updatedAt);

            await expect(rc.connect(service).react(log))
                .to.emit(rc, "MirrorTriggered")
                .withArgs(roundId, answer, updatedAt, ORIGIN_FEED, "EVENT");
        });

        it("Should emit Callback with correct enhanced payload", async function () {
            const answer = 200000000000n;
            const roundId = 1n;
            const updatedAt = 1700000000n;

            const log = createPriceLog(answer, roundId, updatedAt);

            const iface = new ethers.Interface([
                "function updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)"
            ]);
            
            const expectedPayload = iface.encodeFunctionData("updateFromReactive", [
                ethers.ZeroAddress,
                ORIGIN_FEED,
                ORIGIN_DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                updatedAt,
                updatedAt,
                roundId
            ]);

            await expect(rc.connect(service).react(log))
                .to.emit(rc, "Callback")
                .withArgs(DEST_CHAIN_ID, destProxy, CALLBACK_GAS_LIMIT, expectedPayload);
        });

        it("Should increment eventTriggerCount", async function () {
            const log = createPriceLog(200000000000n, 1n, 1700000000n);

            await rc.connect(service).react(log);

            const stats = await rc.getStats();
            expect(stats.eventCount).to.equal(1);
        });

        it("Should update lastForwardedRoundId", async function () {
            const log = createPriceLog(200000000000n, 5n, 1700000000n);

            await rc.connect(service).react(log);

            const stats = await rc.getStats();
            expect(stats.lastRound).to.equal(5);
        });

        it("Should deduplicate round IDs", async function () {
            const log1 = createPriceLog(200000000000n, 10n, 1700000000n);
            const log2 = createPriceLog(210000000000n, 10n, 1700000100n);

            await rc.connect(service).react(log1);
            await rc.connect(service).react(log2);

            // Event count should still be 1 (second was deduplicated)
            const stats = await rc.getStats();
            expect(stats.eventCount).to.equal(1);
        });
    });

    describe("react() - Cron Mode (Heartbeat)", function () {
        function createCronLog(blockNumber: number) {
            return {
                chain_id: 5318007, // Lasna chain ID
                _contract: service.address, // System contract
                topic_0: CRON_TOPIC,
                topic_1: 0n,
                topic_2: 0n,
                topic_3: 0n,
                data: "0x",
                block_number: blockNumber,
                op_code: 1,
                block_hash: ethers.keccak256(ethers.toUtf8Bytes("cronblock")),
                tx_hash: ethers.keccak256(ethers.toUtf8Bytes("crontx")),
                log_index: 0
            };
        }

        it("Should emit CronHeartbeat on cron event", async function () {
            const log = createCronLog(1000);

            await expect(rc.connect(service).react(log))
                .to.emit(rc, "CronHeartbeat");
        });

        it("Should increment cronTriggerCount", async function () {
            const log = createCronLog(1000);

            await rc.connect(service).react(log);

            const stats = await rc.getStats();
            expect(stats.cronCount).to.equal(1);
        });

        it("Should update lastCronBlock", async function () {
            const log = createCronLog(1000);

            await rc.connect(service).react(log);

            const stats = await rc.getStats();
            expect(stats.lastCron).to.equal(1000);
        });

        it("Should skip duplicate cron events in same block", async function () {
            const log1 = createCronLog(1000);
            const log2 = createCronLog(1000); // same block

            await rc.connect(service).react(log1);
            await rc.connect(service).react(log2);

            // Cron count should still be 1
            const stats = await rc.getStats();
            expect(stats.cronCount).to.equal(1);
        });

        it("Should process cron events from different blocks", async function () {
            await rc.connect(service).react(createCronLog(1000));
            await rc.connect(service).react(createCronLog(1100));
            await rc.connect(service).react(createCronLog(1200));

            const stats = await rc.getStats();
            expect(stats.cronCount).to.equal(3);
            expect(stats.lastCron).to.equal(1200);
        });
    });

    describe("Mixed Mode Operation", function () {
        it("Should track event and cron triggers separately", async function () {
            // Create price event
            const priceLog = {
                chain_id: ORIGIN_CHAIN_ID,
                _contract: ORIGIN_FEED,
                topic_0: ANSWER_UPDATED_TOPIC_0,
                topic_1: 200000000000n,
                topic_2: 1n,
                topic_3: 0n,
                data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1700000000]),
                block_number: 1000,
                op_code: 1,
                block_hash: ethers.keccak256(ethers.toUtf8Bytes("block")),
                tx_hash: ethers.keccak256(ethers.toUtf8Bytes("tx")),
                log_index: 0
            };

            // Create cron event
            const cronLog = {
                chain_id: 5318007,
                _contract: service.address,
                topic_0: CRON_TOPIC,
                topic_1: 0n,
                topic_2: 0n,
                topic_3: 0n,
                data: "0x",
                block_number: 1000,
                op_code: 1,
                block_hash: ethers.keccak256(ethers.toUtf8Bytes("cronblock")),
                tx_hash: ethers.keccak256(ethers.toUtf8Bytes("crontx")),
                log_index: 0
            };

            // Process both types
            await rc.connect(service).react(priceLog);
            await rc.connect(service).react(cronLog);

            const stats = await rc.getStats();
            expect(stats.eventCount).to.equal(1);
            expect(stats.cronCount).to.equal(1);
        });
    });

    describe("forceUpdate() - Manual Trigger", function () {
        it("Should emit Callback with correct payload", async function () {
            const roundId = 100;
            const answer = 250000000000n;
            const updatedAt = 1700000000;

            const iface = new ethers.Interface([
                "function updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)"
            ]);
            
            const expectedPayload = iface.encodeFunctionData("updateFromReactive", [
                ethers.ZeroAddress,
                ORIGIN_FEED,
                ORIGIN_DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                updatedAt,
                updatedAt,
                roundId
            ]);

            await expect(rc.forceUpdate(roundId, answer, updatedAt))
                .to.emit(rc, "Callback")
                .withArgs(DEST_CHAIN_ID, destProxy, CALLBACK_GAS_LIMIT, expectedPayload);
        });

        it("Should allow anyone to call forceUpdate", async function () {
            await expect(rc.connect(other).forceUpdate(1, 200000000000, 1700000000))
                .to.emit(rc, "Callback");
        });

        it("Should accept ETH with forceUpdate", async function () {
            await expect(
                rc.forceUpdate(1, 200000000000, 1700000000, { value: ethers.parseEther("0.01") })
            ).to.emit(rc, "Callback");
        });
    });

    describe("getStats() - Statistics", function () {
        it("Should return comprehensive statistics", async function () {
            const stats = await rc.getStats();
            
            // getStats returns a tuple: (lastRound, lastCron, cronCount, eventCount)
            expect(stats.length).to.equal(4);
            expect(stats[0]).to.equal(0n); // lastRound
            expect(stats[1]).to.equal(0n); // lastCron
            expect(stats[2]).to.equal(0n); // cronCount
            expect(stats[3]).to.equal(0n); // eventCount
        });
    });
});
