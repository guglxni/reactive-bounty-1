import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("MultiFeedMirrorRCv2", function () {
    let rsc: Contract;
    let owner: Signer;
    let other: Signer;
    let ownerAddress: string;
    
    // Feed addresses (Base Sepolia)
    const ETH_USD_FEED = "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3";
    const BTC_USD_FEED = "0x961AD289351459A45fC90884eF3AB0278ea95DDE";
    const LINK_USD_FEED = "0xAc6DB6d5538Cd07f58afee9dA736ce192119017B";
    const USDC_USD_FEED = "0xf3138B59cAcbA1a4d7d24fA7b184c20B3941433e";
    
    // Chain IDs
    const ORIGIN_CHAIN_ID = 84532n;        // Base Sepolia
    const DEST_CHAIN_ID = 11155111n;       // Ethereum Sepolia
    
    const SERVICE_ADDRESS = "0x0000000000000000000000000000000000FFFFFF";
    const DEST_PROXY = "0x3DE1a4A19f879595503ADFbf6885E5b0B2545Fb2";
    
    const DECIMALS = 8;
    
    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        
        const MultiFeedMirror = await ethers.getContractFactory("MultiFeedMirrorRCv2");
        
        // Deploy with multiple feeds
        rsc = await MultiFeedMirror.deploy(
            SERVICE_ADDRESS,
            ORIGIN_CHAIN_ID,
            DEST_CHAIN_ID,
            DEST_PROXY,
            [ETH_USD_FEED, BTC_USD_FEED, LINK_USD_FEED],
            [DECIMALS, DECIMALS, DECIMALS],
            ["ETH/USD", "BTC/USD", "LINK/USD"]
        );
        await rsc.waitForDeployment();
    });
    
    describe("Deployment", function () {
        it("Should set owner correctly", async function () {
            expect(await rsc.getOwner()).to.equal(ownerAddress);
        });
        
        it("Should initialize with correct feed count", async function () {
            expect(await rsc.getFeedCount()).to.equal(3);
        });
        
        it("Should store chain configuration", async function () {
            expect(await rsc.originChainId()).to.equal(ORIGIN_CHAIN_ID);
            expect(await rsc.destinationChainId()).to.equal(DEST_CHAIN_ID);
            expect(await rsc.destinationProxy()).to.equal(DEST_PROXY);
        });
        
        it("Should have domain separator", async function () {
            const domainSeparator = await rsc.getDomainSeparator();
            expect(domainSeparator).to.not.equal(ethers.ZeroHash);
        });
        
        it("Should not be paused initially", async function () {
            expect(await rsc.isPaused()).to.equal(false);
        });
    });
    
    describe("Feed Registration", function () {
        it("Should register feeds with correct info", async function () {
            const [decimals, symbol, active, lastRoundId, callbackCount] = 
                await rsc.getFeedInfo(ETH_USD_FEED);
            
            expect(decimals).to.equal(DECIMALS);
            expect(symbol).to.equal("ETH/USD");
            expect(active).to.equal(true);
            expect(lastRoundId).to.equal(0);
            expect(callbackCount).to.equal(0);
        });
        
        it("Should return active feeds", async function () {
            const activeFeeds = await rsc.getActiveFeeds();
            expect(activeFeeds.length).to.equal(3);
            expect(activeFeeds).to.include(ETH_USD_FEED);
            expect(activeFeeds).to.include(BTC_USD_FEED);
            expect(activeFeeds).to.include(LINK_USD_FEED);
        });
    });
    
    describe("Feed Management", function () {
        it("Should add a new feed", async function () {
            await rsc.addFeed(USDC_USD_FEED, DECIMALS, "USDC/USD");
            
            expect(await rsc.getFeedCount()).to.equal(4);
            
            const [decimals, symbol, active] = await rsc.getFeedInfo(USDC_USD_FEED);
            expect(symbol).to.equal("USDC/USD");
            expect(active).to.equal(true);
        });
        
        it("Should remove (deactivate) a feed", async function () {
            await rsc.removeFeed(LINK_USD_FEED);
            
            const [, , active] = await rsc.getFeedInfo(LINK_USD_FEED);
            expect(active).to.equal(false);
            
            const activeFeeds = await rsc.getActiveFeeds();
            expect(activeFeeds.length).to.equal(2);
            expect(activeFeeds).to.not.include(LINK_USD_FEED);
        });
        
        it("Should reject duplicate feed addition", async function () {
            await expect(
                rsc.addFeed(ETH_USD_FEED, DECIMALS, "ETH/USD")
            ).to.be.revertedWith("Feed already active");
        });
        
        it("Should only allow owner to add feeds", async function () {
            await expect(
                (rsc.connect(other) as typeof rsc).addFeed(USDC_USD_FEED, DECIMALS, "USDC/USD")
            ).to.be.reverted;
        });
        
        it("Should emit FeedAdded event", async function () {
            await expect(rsc.addFeed(USDC_USD_FEED, DECIMALS, "USDC/USD"))
                .to.emit(rsc, "FeedAdded")
                .withArgs(USDC_USD_FEED, "USDC/USD", DECIMALS);
        });
        
        it("Should emit FeedRemoved event", async function () {
            await expect(rsc.removeFeed(LINK_USD_FEED))
                .to.emit(rsc, "FeedRemoved")
                .withArgs(LINK_USD_FEED);
        });
    });
    
    describe("Force Update", function () {
        it("Should allow force update for active feed", async function () {
            const roundId = 12345;
            const answer = 290000000000n;
            const updatedAt = BigInt(Math.floor(Date.now() / 1000));
            
            await expect(
                rsc.forceUpdate(ETH_USD_FEED, roundId, answer, updatedAt)
            )
                .to.emit(rsc, "Callback")
                .and.to.emit(rsc, "CallbackSent")
                .withArgs(ETH_USD_FEED, roundId, DEST_PROXY);
        });
        
        it("Should reject force update for inactive feed", async function () {
            await rsc.removeFeed(LINK_USD_FEED);
            
            await expect(
                rsc.forceUpdate(LINK_USD_FEED, 1, 1000000000n, 1)
            ).to.be.revertedWith("Feed not active");
        });
        
        it("Should increment callback count", async function () {
            const roundId = 12345;
            const answer = 290000000000n;
            const updatedAt = BigInt(Math.floor(Date.now() / 1000));
            
            await rsc.forceUpdate(ETH_USD_FEED, roundId, answer, updatedAt);
            
            const [, , , , callbackCount] = await rsc.getFeedInfo(ETH_USD_FEED);
            expect(callbackCount).to.equal(1);
        });
        
        it("Should increment total callbacks", async function () {
            const roundId = 12345;
            const answer = 290000000000n;
            const updatedAt = BigInt(Math.floor(Date.now() / 1000));
            
            await rsc.forceUpdate(ETH_USD_FEED, roundId, answer, updatedAt);
            await rsc.forceUpdate(BTC_USD_FEED, roundId, 8700000000000n, updatedAt);
            
            const [, totalCallbacks] = await rsc.getStats();
            expect(totalCallbacks).to.equal(2);
        });
    });
    
    describe("Statistics", function () {
        it("Should track stats correctly", async function () {
            const [feedCount, totalCallbacks, totalEvents] = await rsc.getStats();
            
            expect(feedCount).to.equal(3);
            expect(totalCallbacks).to.equal(0);
            expect(totalEvents).to.equal(0);
        });
        
        it("Should update stats after force update", async function () {
            await rsc.forceUpdate(ETH_USD_FEED, 1, 290000000000n, 1);
            await rsc.forceUpdate(BTC_USD_FEED, 1, 8700000000000n, 1);
            
            const [feedCount, totalCallbacks] = await rsc.getStats();
            
            expect(feedCount).to.equal(3);
            expect(totalCallbacks).to.equal(2);
        });
    });
    
    describe("Message Version", function () {
        it("Should have correct message version", async function () {
            expect(await rsc.MESSAGE_VERSION()).to.equal(1);
        });
    });
    
    describe("Edge Cases", function () {
        it("Should reject empty feed array in constructor", async function () {
            const MultiFeedMirror = await ethers.getContractFactory("MultiFeedMirrorRCv2");
            
            await expect(
                MultiFeedMirror.deploy(
                    SERVICE_ADDRESS,
                    ORIGIN_CHAIN_ID,
                    DEST_CHAIN_ID,
                    DEST_PROXY,
                    [], // Empty
                    [],
                    []
                )
            ).to.be.revertedWith("No feeds provided");
        });
        
        it("Should reject mismatched array lengths", async function () {
            const MultiFeedMirror = await ethers.getContractFactory("MultiFeedMirrorRCv2");
            
            await expect(
                MultiFeedMirror.deploy(
                    SERVICE_ADDRESS,
                    ORIGIN_CHAIN_ID,
                    DEST_CHAIN_ID,
                    DEST_PROXY,
                    [ETH_USD_FEED, BTC_USD_FEED],
                    [DECIMALS], // Mismatch
                    ["ETH/USD", "BTC/USD"]
                )
            ).to.be.revertedWith("Array length mismatch");
        });
        
        it("Should reject adding zero address feed", async function () {
            await expect(
                rsc.addFeed(ethers.ZeroAddress, DECIMALS, "Invalid")
            ).to.be.revertedWith("Invalid aggregator");
        });
        
        it("Should reject removing non-active feed", async function () {
            await rsc.removeFeed(ETH_USD_FEED);
            
            await expect(
                rsc.removeFeed(ETH_USD_FEED)
            ).to.be.revertedWith("Feed not active");
        });
    });
});
