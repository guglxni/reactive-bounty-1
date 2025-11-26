import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("MultiFeedDestinationV2", function () {
    let destination: Contract;
    let owner: Signer;
    let rvm: Signer;
    let other: Signer;
    let callbackProxy: Signer;
    
    let ownerAddress: string;
    let rvmAddress: string;
    let callbackProxyAddress: string;
    
    // Feed addresses (Base Sepolia aggregators)
    const ETH_USD_FEED = "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3";
    const BTC_USD_FEED = "0x961AD289351459A45fC90884eF3AB0278ea95DDE";
    const LINK_USD_FEED = "0xAc6DB6d5538Cd07f58afee9dA736ce192119017B";
    const USDC_USD_FEED = "0xf3138B59cAcbA1a4d7d24fA7b184c20B3941433e";
    
    const DECIMALS = 8;
    const MESSAGE_VERSION = 1;
    
    beforeEach(async function () {
        [owner, rvm, other, callbackProxy] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        rvmAddress = await rvm.getAddress();
        callbackProxyAddress = await callbackProxy.getAddress();
        
        const MultiFeedDestination = await ethers.getContractFactory("MultiFeedDestinationV2");
        destination = await MultiFeedDestination.deploy(callbackProxyAddress);
        await destination.waitForDeployment();
        
        // Authorize RVM - set to deployer since rvm_id is set to msg.sender in constructor
        // In production, this would be the actual RSC address
        await destination.setAuthorizedReactiveContract(ownerAddress);
    });
    
    describe("Deployment", function () {
        it("Should set owner correctly", async function () {
            expect(await destination.owner()).to.equal(ownerAddress);
        });
        
        it("Should have zero feeds initially", async function () {
            expect(await destination.getFeedCount()).to.equal(0);
        });
        
        it("Should have correct message version", async function () {
            expect(await destination.EXPECTED_MESSAGE_VERSION()).to.equal(MESSAGE_VERSION);
        });
    });
    
    describe("Feed Registration", function () {
        it("Should register a single feed", async function () {
            await destination.registerFeed(ETH_USD_FEED, DECIMALS, "ETH / USD");
            
            expect(await destination.getFeedCount()).to.equal(1);
            
            const config = await destination.feedConfigs(ETH_USD_FEED);
            expect(config.decimals).to.equal(DECIMALS);
            expect(config.description).to.equal("ETH / USD");
            expect(config.enabled).to.equal(true);
        });
        
        it("Should register multiple feeds in batch", async function () {
            await destination.registerFeeds(
                [ETH_USD_FEED, BTC_USD_FEED, LINK_USD_FEED],
                [DECIMALS, DECIMALS, DECIMALS],
                ["ETH / USD", "BTC / USD", "LINK / USD"]
            );
            
            expect(await destination.getFeedCount()).to.equal(3);
            
            const feeds = await destination.getRegisteredFeeds();
            expect(feeds.length).to.equal(3);
            expect(feeds[0]).to.equal(ETH_USD_FEED);
            expect(feeds[1]).to.equal(BTC_USD_FEED);
            expect(feeds[2]).to.equal(LINK_USD_FEED);
        });
        
        it("Should reject duplicate feed registration", async function () {
            await destination.registerFeed(ETH_USD_FEED, DECIMALS, "ETH / USD");
            await expect(
                destination.registerFeed(ETH_USD_FEED, DECIMALS, "ETH / USD")
            ).to.be.revertedWith("Feed already registered");
        });
        
        it("Should only allow owner to register feeds", async function () {
            await expect(
                destination.connect(other).registerFeed(ETH_USD_FEED, DECIMALS, "ETH / USD")
            ).to.be.revertedWith("Not authorized: only owner");
        });
        
        it("Should emit FeedRegistered event", async function () {
            await expect(destination.registerFeed(ETH_USD_FEED, DECIMALS, "ETH / USD"))
                .to.emit(destination, "FeedRegistered")
                .withArgs(ETH_USD_FEED, DECIMALS, "ETH / USD");
        });
    });
    
    describe("Feed Enable/Disable", function () {
        beforeEach(async function () {
            await destination.registerFeed(ETH_USD_FEED, DECIMALS, "ETH / USD");
        });
        
        it("Should disable a feed", async function () {
            await destination.disableFeed(ETH_USD_FEED);
            const config = await destination.feedConfigs(ETH_USD_FEED);
            expect(config.enabled).to.equal(false);
        });
        
        it("Should re-enable a disabled feed", async function () {
            await destination.disableFeed(ETH_USD_FEED);
            await destination.enableFeed(ETH_USD_FEED);
            const config = await destination.feedConfigs(ETH_USD_FEED);
            expect(config.enabled).to.equal(true);
        });
    });
    
    describe("Callback Processing", function () {
        const roundId = 12345n;
        const answer = 290000000000n; // $2900 with 8 decimals
        const updatedAt = BigInt(Math.floor(Date.now() / 1000));
        
        beforeEach(async function () {
            await destination.registerFeed(ETH_USD_FEED, DECIMALS, "ETH / USD");
            await destination.registerFeed(BTC_USD_FEED, DECIMALS, "BTC / USD");
        });
        
        // Note: rvm_id is set to deployer (owner) in AbstractCallback constructor
        // So we use ownerAddress as the sender in test calls
        
        it("Should process ETH/USD update", async function () {
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, // rvm_id set to deployer
                ETH_USD_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                updatedAt,
                updatedAt,
                roundId
            );
            
            const [, latestAnswer] = await destination.latestRoundData(ETH_USD_FEED);
            expect(latestAnswer).to.equal(answer);
        });
        
        it("Should process BTC/USD update independently", async function () {
            const btcRoundId = 54321n;
            const btcAnswer = 8700000000000n; // $87,000 with 8 decimals
            
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress,
                ETH_USD_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                updatedAt,
                updatedAt,
                roundId
            );
            
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress,
                BTC_USD_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                btcRoundId,
                btcAnswer,
                updatedAt,
                updatedAt,
                btcRoundId
            );
            
            const [, ethAnswer] = await destination.latestRoundData(ETH_USD_FEED);
            const [, btcLatestAnswer] = await destination.latestRoundData(BTC_USD_FEED);
            
            expect(ethAnswer).to.equal(answer);
            expect(btcLatestAnswer).to.equal(btcAnswer);
        });
        
        it("Should auto-register unknown feeds from authorized source", async function () {
            // USDC feed not registered, but should auto-register
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, // rvm_id is deployer
                USDC_USD_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                1n,
                100000000n, // $1.00
                updatedAt,
                updatedAt,
                1n
            );
            
            const config = await destination.feedConfigs(USDC_USD_FEED);
            expect(config.enabled).to.equal(true);
            expect(config.description).to.equal("Auto-registered feed");
        });
        
        it("Should emit events for updates", async function () {
            await expect(
                destination.connect(callbackProxy).updateFromReactive(
                    ownerAddress, // rvm_id is deployer
                    ETH_USD_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    roundId,
                    answer,
                    updatedAt,
                    updatedAt,
                    roundId
                )
            )
                .to.emit(destination, "FeedUpdated")
                .withArgs(ETH_USD_FEED, roundId, answer, updatedAt)
                .and.to.emit(destination, "PriceUpdated")
                .withArgs(ETH_USD_FEED, roundId, answer, updatedAt);
        });
        
        it("Should reject unauthorized sender", async function () {
            await expect(
                destination.connect(other).updateFromReactive(
                    ownerAddress, // rvm_id is deployer
                    ETH_USD_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    roundId,
                    answer,
                    updatedAt,
                    updatedAt,
                    roundId
                )
            ).to.be.reverted;
        });
        
        it("Should reject wrong RVM ID (unauthorized sender)", async function () {
            const otherAddress = await other.getAddress();
            await expect(
                destination.connect(callbackProxy).updateFromReactive(
                    otherAddress, // Wrong RVM ID - will fail authorizedReactiveContract check
                    ETH_USD_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    roundId,
                    answer,
                    updatedAt,
                    updatedAt,
                    roundId
                )
            ).to.be.revertedWith("Unauthorized RVM Sender"); // authorizedReactiveContract check
        });
        
        it("Should reject wrong message version", async function () {
            await expect(
                destination.connect(callbackProxy).updateFromReactive(
                    ownerAddress, // rvm_id is deployer
                    ETH_USD_FEED,
                    DECIMALS,
                    2, // Wrong version
                    roundId,
                    answer,
                    updatedAt,
                    updatedAt,
                    roundId
                )
            ).to.be.revertedWith("Invalid message version");
        });
        
        it("Should reject decimals mismatch", async function () {
            await expect(
                destination.connect(callbackProxy).updateFromReactive(
                    ownerAddress, // rvm_id is deployer
                    ETH_USD_FEED,
                    6, // Wrong decimals
                    MESSAGE_VERSION,
                    roundId,
                    answer,
                    updatedAt,
                    updatedAt,
                    roundId
                )
            ).to.be.revertedWith("Decimals mismatch");
        });
        
        it("Should reject negative price", async function () {
            await expect(
                destination.connect(callbackProxy).updateFromReactive(
                    ownerAddress, // rvm_id is deployer
                    ETH_USD_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    roundId,
                    -100n, // Negative
                    updatedAt,
                    updatedAt,
                    roundId
                )
            ).to.be.revertedWith("Invalid price: must be positive");
        });
        
        it("Should reject stale roundId", async function () {
            // First update
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, // rvm_id is deployer
                ETH_USD_FEED,
                DECIMALS,
                MESSAGE_VERSION,
                roundId,
                answer,
                updatedAt,
                updatedAt,
                roundId
            );
            
            // Try to send older round
            await expect(
                destination.connect(callbackProxy).updateFromReactive(
                    ownerAddress, // rvm_id is deployer
                    ETH_USD_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    roundId - 1n, // Older
                    answer,
                    updatedAt,
                    updatedAt,
                    roundId - 1n
                )
            ).to.be.revertedWith("Stale update: roundId regression");
        });
    });
    
    describe("Multi-Feed Views", function () {
        const updatedAt = BigInt(Math.floor(Date.now() / 1000));
        
        beforeEach(async function () {
            await destination.registerFeeds(
                [ETH_USD_FEED, BTC_USD_FEED, LINK_USD_FEED],
                [DECIMALS, DECIMALS, DECIMALS],
                ["ETH / USD", "BTC / USD", "LINK / USD"]
            );
            
            // Add some price data (ownerAddress is rvm_id set in constructor)
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, ETH_USD_FEED, DECIMALS, MESSAGE_VERSION,
                1n, 290000000000n, updatedAt, updatedAt, 1n
            );
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, BTC_USD_FEED, DECIMALS, MESSAGE_VERSION,
                1n, 8700000000000n, updatedAt, updatedAt, 1n
            );
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, LINK_USD_FEED, DECIMALS, MESSAGE_VERSION,
                1n, 1300000000n, updatedAt, updatedAt, 1n
            );
        });
        
        it("Should return all prices", async function () {
            const [feeds, prices, timestamps, staleFlags] = await destination.getAllPrices();
            
            expect(feeds.length).to.equal(3);
            expect(prices[0]).to.equal(290000000000n);  // ETH
            expect(prices[1]).to.equal(8700000000000n); // BTC
            expect(prices[2]).to.equal(1300000000n);    // LINK
        });
        
        it("Should track statistics per feed", async function () {
            const [totalUpdates] = await destination.getFeedStats(ETH_USD_FEED);
            expect(totalUpdates).to.equal(1);
        });
        
        it("Should return correct stale status", async function () {
            // Fresh data should not be stale
            expect(await destination.isStale(ETH_USD_FEED)).to.equal(false);
            
            // Unregistered feed should be stale
            const randomFeed = "0x0000000000000000000000000000000000000001";
            expect(await destination.isStale(randomFeed)).to.equal(true);
        });
    });
    
    describe("Historical Data", function () {
        const updatedAt = BigInt(Math.floor(Date.now() / 1000));
        
        beforeEach(async function () {
            await destination.registerFeed(ETH_USD_FEED, DECIMALS, "ETH / USD");
        });
        
        it("Should store historical rounds", async function () {
            // Add multiple rounds
            for (let i = 1; i <= 5; i++) {
                await destination.connect(callbackProxy).updateFromReactive(
                    ownerAddress, // rvm_id is deployer
                    ETH_USD_FEED,
                    DECIMALS,
                    MESSAGE_VERSION,
                    BigInt(i),
                    BigInt(290000000000 + i * 1000000), // Slightly different prices
                    updatedAt + BigInt(i),
                    updatedAt + BigInt(i),
                    BigInt(i)
                );
            }
            
            // Query historical round
            const [roundId, answer] = await destination.getRoundData(ETH_USD_FEED, 3);
            expect(roundId).to.equal(3);
        });
        
        it("Should reject query for non-existent round", async function () {
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, ETH_USD_FEED, DECIMALS, MESSAGE_VERSION,
                1n, 290000000000n, updatedAt, updatedAt, 1n
            );
            
            await expect(
                destination.getRoundData(ETH_USD_FEED, 999)
            ).to.be.revertedWith("Round data not found");
        });
    });
    
    describe("Global Statistics", function () {
        const updatedAt = BigInt(Math.floor(Date.now() / 1000));
        
        beforeEach(async function () {
            await destination.registerFeeds(
                [ETH_USD_FEED, BTC_USD_FEED],
                [DECIMALS, DECIMALS],
                ["ETH / USD", "BTC / USD"]
            );
        });
        
        it("Should track global update count", async function () {
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, ETH_USD_FEED, DECIMALS, MESSAGE_VERSION,
                1n, 290000000000n, updatedAt, updatedAt, 1n
            );
            await destination.connect(callbackProxy).updateFromReactive(
                ownerAddress, BTC_USD_FEED, DECIMALS, MESSAGE_VERSION,
                1n, 8700000000000n, updatedAt, updatedAt, 1n
            );
            
            expect(await destination.totalGlobalUpdates()).to.equal(2);
        });
    });
});
