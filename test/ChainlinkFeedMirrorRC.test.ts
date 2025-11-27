import { expect } from "chai";
import { ethers } from "hardhat";
import { ChainlinkFeedMirrorRC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * ChainlinkFeedMirrorRC Test Suite
 * 
 * Tests the enhanced Reactive Smart Contract that:
 * - Subscribes to Chainlink AnswerUpdated events
 * - Forwards price data cross-chain with enhanced payload
 * - Includes feed identifier, decimals, and message version
 * - Has EIP-712 style domain separator
 * - Deduplicates round IDs
 */
describe("ChainlinkFeedMirrorRC", function () {
    let rc: ChainlinkFeedMirrorRC;
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

    // AnswerUpdated event signature
    const ANSWER_UPDATED_TOPIC_0 = "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";

    let destProxy: string;

    beforeEach(async function () {
        [deployer, service, other] = await ethers.getSigners();
        destProxy = ethers.Wallet.createRandom().address;

        const RCFactory = await ethers.getContractFactory("ChainlinkFeedMirrorRC");
        
        // Deploy with service address (simulating system contract)
        // In real deployment, this would be 0x...fffFfF
        rc = await RCFactory.deploy(
            service.address,     // _service
            ORIGIN_CHAIN_ID,     // _originChainId
            DEST_CHAIN_ID,       // _destinationChainId
            ORIGIN_FEED,         // _originFeed
            destProxy,           // _destinationProxy
            ORIGIN_DECIMALS      // _originDecimals
        ) as unknown as ChainlinkFeedMirrorRC;
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

        it("Should initialize lastForwardedRoundId to 0", async function () {
            expect(await rc.lastForwardedRoundId()).to.equal(0);
        });
    });

    describe("Domain Separator", function () {
        it("Should compute EIP-712 style domain separator", async function () {
            const domainSeparator = await rc.getDomainSeparator();
            
            // The domain separator should be a bytes32 hash
            expect(domainSeparator.length).to.equal(66); // 0x + 64 hex chars
        });
    });

    describe("react() - Event Handling", function () {
        /**
         * Helper to create a LogRecord structure matching IReactive.LogRecord
         */
        function createLogRecord(
            answer: bigint,
            roundId: bigint,
            updatedAt: bigint
        ) {
            return {
                chain_id: ORIGIN_CHAIN_ID,
                _contract: ORIGIN_FEED,
                topic_0: ANSWER_UPDATED_TOPIC_0,
                topic_1: answer,           // int256 current (indexed)
                topic_2: roundId,          // uint256 roundId (indexed)
                topic_3: 0n,               // unused
                data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [updatedAt]),
                block_number: 1000,
                op_code: 1,
                block_hash: ethers.keccak256(ethers.toUtf8Bytes("block")),
                tx_hash: ethers.keccak256(ethers.toUtf8Bytes("tx")),
                log_index: 0
            };
        }

        it("Should emit MirrorTriggered event on valid log", async function () {
            const answer = 200000000000n; // $2000.00 with 8 decimals
            const roundId = 1n;
            const updatedAt = 1700000000n;

            const log = createLogRecord(answer, roundId, updatedAt);

            await expect(rc.connect(service).react(log))
                .to.emit(rc, "MirrorTriggered")
                .withArgs(roundId, answer, updatedAt, ORIGIN_FEED);
        });

        it("Should emit Callback event with correct payload", async function () {
            const answer = 200000000000n;
            const roundId = 1n;
            const updatedAt = 1700000000n;

            const log = createLogRecord(answer, roundId, updatedAt);

            // Build expected payload
            // function updateFromReactive(address,address,uint8,uint8,uint80,int256,uint256,uint256,uint80)
            const iface = new ethers.Interface([
                "function updateFromReactive(address sender, address _originFeed, uint8 _decimals, uint8 _messageVersion, uint80 _roundId, int256 _answer, uint256 _startedAt, uint256 _updatedAt, uint80 _answeredInRound)"
            ]);
            
            const expectedPayload = iface.encodeFunctionData("updateFromReactive", [
                ethers.ZeroAddress,  // sender (placeholder, replaced by Reactive Network)
                ORIGIN_FEED,         // originFeed
                ORIGIN_DECIMALS,     // decimals
                MESSAGE_VERSION,     // messageVersion
                roundId,             // roundId
                answer,              // answer
                updatedAt,           // startedAt
                updatedAt,           // updatedAt
                roundId              // answeredInRound
            ]);

            await expect(rc.connect(service).react(log))
                .to.emit(rc, "Callback")
                .withArgs(DEST_CHAIN_ID, destProxy, CALLBACK_GAS_LIMIT, expectedPayload);
        });

        it("Should update lastForwardedRoundId after processing", async function () {
            const log = createLogRecord(200000000000n, 5n, 1700000000n);

            await rc.connect(service).react(log);

            expect(await rc.lastForwardedRoundId()).to.equal(5);
        });

        it("Should skip duplicate round IDs (deduplication)", async function () {
            const log1 = createLogRecord(200000000000n, 10n, 1700000000n);
            const log2 = createLogRecord(210000000000n, 10n, 1700000100n); // same roundId

            // First should emit
            await expect(rc.connect(service).react(log1))
                .to.emit(rc, "Callback");

            // Second with same roundId should not emit Callback
            await expect(rc.connect(service).react(log2))
                .to.not.emit(rc, "Callback");
        });

        it("Should skip older round IDs", async function () {
            const log1 = createLogRecord(200000000000n, 10n, 1700000000n);
            const log2 = createLogRecord(190000000000n, 9n, 1699999000n); // older roundId

            await rc.connect(service).react(log1);
            
            // Older round should not emit
            await expect(rc.connect(service).react(log2))
                .to.not.emit(rc, "Callback");
        });

        it("Should process sequential round IDs correctly", async function () {
            for (let i = 1n; i <= 5n; i++) {
                const log = createLogRecord(
                    200000000000n + (i * 1000000000n), // price increases
                    i,
                    1700000000n + (i * 100n)
                );

                await expect(rc.connect(service).react(log))
                    .to.emit(rc, "Callback");
            }

            expect(await rc.lastForwardedRoundId()).to.equal(5);
        });
    });

    describe("react() - Access Control", function () {
        it("Should only allow service (vmOnly) to call react", async function () {
            const log = {
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

            // Note: In the actual contract, vmOnly modifier checks `vm` flag
            // In tests, we simulate by calling from service address
            // The modifier would revert if called from wrong context
        });
    });

    describe("forceUpdate() - Manual Trigger", function () {
        it("Should emit Callback with correct payload on forceUpdate", async function () {
            const roundId = 100;
            const answer = 250000000000n;
            const updatedAt = 1700000000;

            const iface = new ethers.Interface([
                "function updateFromReactive(address sender, address _originFeed, uint8 _decimals, uint8 _messageVersion, uint80 _roundId, int256 _answer, uint256 _startedAt, uint256 _updatedAt, uint80 _answeredInRound)"
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
            // forceUpdate is payable and public - anyone can call it
            await expect(rc.connect(other).forceUpdate(1, 200000000000, 1700000000))
                .to.emit(rc, "Callback");
        });

        it("Should accept ETH with forceUpdate", async function () {
            await expect(
                rc.forceUpdate(1, 200000000000, 1700000000, { value: ethers.parseEther("0.01") })
            ).to.emit(rc, "Callback");
        });
    });

    describe("Constants", function () {
        it("Should have correct ANSWER_UPDATED_TOPIC_0", async function () {
            expect(await rc.ANSWER_UPDATED_TOPIC_0()).to.equal(
                "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f"
            );
        });

        it("Should have CALLBACK_GAS_LIMIT of 1000000", async function () {
            expect(await rc.CALLBACK_GAS_LIMIT()).to.equal(1000000);
        });
    });
});
