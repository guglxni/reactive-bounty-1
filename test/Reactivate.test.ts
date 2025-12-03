/**
 * Reactivate Auto-Funding System Tests
 * 
 * Tests for:
 * - DevAccount: withdraw, whitelist, ownership
 * - DevAccountFactory: account creation
 * - Funder: refill logic, debt coverage, callbacks
 * - FunderFactory: funder creation, tracking
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
    DevAccount,
    DevAccountFactory,
    Funder,
    FunderFactory,
} from "../typechain-types";

describe("Reactivate Auto-Funding System", function () {
    // ================== Fixtures ==================
    async function deployDevAccountFixture() {
        const [owner, other, whitelisted] = await ethers.getSigners();
        
        const DevAccount = await ethers.getContractFactory("DevAccount");
        const devAccount = await DevAccount.deploy(owner.address, {
            value: ethers.parseEther("10")
        });
        await devAccount.waitForDeployment();
        
        return { devAccount, owner, other, whitelisted };
    }

    async function deployDevAccountFactoryFixture() {
        const [owner, dev1, dev2] = await ethers.getSigners();
        
        const DevAccountFactory = await ethers.getContractFactory("DevAccountFactory");
        const factory = await DevAccountFactory.deploy();
        await factory.waitForDeployment();
        
        return { factory, owner, dev1, dev2 };
    }

    async function deployFunderFixture() {
        const [owner, callbackProxy, callbackContract, reactiveContract] = await ethers.getSigners();
        
        // Create a DevAccount first
        const DevAccountContract = await ethers.getContractFactory("DevAccount");
        const devAccount = await DevAccountContract.deploy(owner.address, {
            value: ethers.parseEther("10")
        });
        await devAccount.waitForDeployment();
        
        const Funder = await ethers.getContractFactory("Funder");
        const funder = await Funder.deploy(
            callbackProxy.address,       // callback proxy
            callbackContract.address,    // callback contract to refill
            reactiveContract.address,    // RSC to cover debt
            ethers.parseEther("0.5"),    // refill value
            ethers.parseEther("0.1"),    // refill threshold
            await devAccount.getAddress(), // dev account
            { value: ethers.parseEther("5") }
        );
        await funder.waitForDeployment();
        
        // Whitelist funder on dev account
        await devAccount.whitelist(await funder.getAddress());
        
        return { 
            funder, 
            owner, 
            callbackProxy, 
            callbackContract, 
            reactiveContract, 
            devAccount 
        };
    }

    async function deployFullSystemFixture() {
        const [owner, callbackContract, reactiveContract] = await ethers.getSigners();
        
        // Deploy mock callback proxy
        const MockCallbackProxy = await ethers.getContractFactory("MockCallbackProxy");
        const callbackProxy = await MockCallbackProxy.deploy();
        await callbackProxy.waitForDeployment();
        
        // Deploy DevAccountFactory
        const DevAccountFactory = await ethers.getContractFactory("DevAccountFactory");
        const devAccountFactory = await DevAccountFactory.deploy();
        await devAccountFactory.waitForDeployment();
        
        // Deploy FunderFactory
        const FunderFactory = await ethers.getContractFactory("FunderFactory");
        const funderFactory = await FunderFactory.deploy(
            await devAccountFactory.getAddress(),
            await callbackProxy.getAddress()
        );
        await funderFactory.waitForDeployment();
        
        // Create DevAccount for owner with extra funds
        await devAccountFactory.createDevAccount({ value: ethers.parseEther("20") });
        const devAccountAddr = await devAccountFactory.devAccounts(owner.address);
        
        // Get DevAccount contract and whitelist the FunderFactory
        const devAccount = await ethers.getContractAt("DevAccount", devAccountAddr);
        await devAccount.whitelist(await funderFactory.getAddress());
        
        return {
            devAccountFactory,
            funderFactory,
            callbackProxy,
            devAccountAddr,
            devAccount,
            owner,
            callbackContract,
            reactiveContract,
        };
    }

    // ================== DevAccount Tests ==================
    describe("DevAccount", function () {
        it("Should deploy with initial balance", async function () {
            const { devAccount } = await loadFixture(deployDevAccountFixture);
            expect(await ethers.provider.getBalance(await devAccount.getAddress()))
                .to.equal(ethers.parseEther("10"));
        });

        it("Should allow owner to withdraw", async function () {
            const { devAccount, owner, other } = await loadFixture(deployDevAccountFixture);
            
            const balanceBefore = await ethers.provider.getBalance(other.address);
            await devAccount.withdraw(other.address, ethers.parseEther("1"));
            const balanceAfter = await ethers.provider.getBalance(other.address);
            
            expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1"));
        });

        it("Should reject withdraw from non-owner", async function () {
            const { devAccount, other } = await loadFixture(deployDevAccountFixture);
            
            await expect(
                devAccount.connect(other).withdraw(other.address, ethers.parseEther("1"))
            ).to.be.revertedWith("DevAccount: not whitelisted");
        });

        it("Should allow whitelisted address to withdraw", async function () {
            const { devAccount, owner, whitelisted, other } = await loadFixture(deployDevAccountFixture);
            
            // Whitelist address
            await devAccount.whitelist(whitelisted.address);
            expect(await devAccount.isWhitelisted(whitelisted.address)).to.be.true;
            
            // Withdraw from whitelisted
            const balanceBefore = await ethers.provider.getBalance(other.address);
            await devAccount.connect(whitelisted).withdraw(other.address, ethers.parseEther("1"));
            const balanceAfter = await ethers.provider.getBalance(other.address);
            
            expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1"));
        });

        it("Should allow removing from whitelist", async function () {
            const { devAccount, whitelisted } = await loadFixture(deployDevAccountFixture);
            
            await devAccount.whitelist(whitelisted.address);
            expect(await devAccount.isWhitelisted(whitelisted.address)).to.be.true;
            
            await devAccount.removeFromWhitelist(whitelisted.address);
            expect(await devAccount.isWhitelisted(whitelisted.address)).to.be.false;
        });

        it("Should receive ETH", async function () {
            const { devAccount, other } = await loadFixture(deployDevAccountFixture);
            
            const balanceBefore = await ethers.provider.getBalance(await devAccount.getAddress());
            await other.sendTransaction({
                to: await devAccount.getAddress(),
                value: ethers.parseEther("1"),
            });
            const balanceAfter = await ethers.provider.getBalance(await devAccount.getAddress());
            
            expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1"));
        });
    });

    // ================== DevAccountFactory Tests ==================
    describe("DevAccountFactory", function () {
        it("Should create dev account", async function () {
            const { factory, dev1 } = await loadFixture(deployDevAccountFactoryFixture);
            
            await factory.connect(dev1).createDevAccount({ value: ethers.parseEther("5") });
            
            const devAccountAddr = await factory.devAccounts(dev1.address);
            expect(devAccountAddr).to.not.equal(ethers.ZeroAddress);
        });

        it("Should not allow duplicate dev accounts", async function () {
            const { factory, dev1 } = await loadFixture(deployDevAccountFactoryFixture);
            
            await factory.connect(dev1).createDevAccount({ value: ethers.parseEther("5") });
            
            await expect(
                factory.connect(dev1).createDevAccount({ value: ethers.parseEther("5") })
            ).to.be.revertedWith("DevAccountFactory: account exists");
        });

        it("Should track account count", async function () {
            const { factory, dev1, dev2 } = await loadFixture(deployDevAccountFactoryFixture);
            
            expect(await factory.accountCount()).to.equal(0);
            
            await factory.connect(dev1).createDevAccount({ value: ethers.parseEther("5") });
            expect(await factory.accountCount()).to.equal(1);
            
            await factory.connect(dev2).createDevAccount({ value: ethers.parseEther("5") });
            expect(await factory.accountCount()).to.equal(2);
        });

        it("Should fund dev account with sent ETH", async function () {
            const { factory, dev1 } = await loadFixture(deployDevAccountFactoryFixture);
            
            await factory.connect(dev1).createDevAccount({ value: ethers.parseEther("5") });
            
            const devAccountAddr = await factory.devAccounts(dev1.address);
            expect(await ethers.provider.getBalance(devAccountAddr)).to.equal(ethers.parseEther("5"));
        });
    });

    // ================== Funder Tests ==================
    describe("Funder", function () {
        it("Should deploy with correct configuration", async function () {
            const { funder, callbackContract, reactiveContract, devAccount } = 
                await loadFixture(deployFunderFixture);
            
            expect(await funder.callbackReceiver()).to.equal(callbackContract.address);
            expect(await funder.reactiveReceiver()).to.equal(reactiveContract.address);
            expect(await funder.refillValue()).to.equal(ethers.parseEther("0.5"));
            expect(await funder.refillThreshold()).to.equal(ethers.parseEther("0.1"));
            expect(await funder.devAccount()).to.equal(await devAccount.getAddress());
        });

        it("Should have initial balance", async function () {
            const { funder } = await loadFixture(deployFunderFixture);
            expect(await ethers.provider.getBalance(await funder.getAddress()))
                .to.equal(ethers.parseEther("5"));
        });

        it("Should accept callback from authorized sender with correct RVM ID", async function () {
            const { funder, callbackProxy, owner } = await loadFixture(deployFunderFixture);
            
            // The rvm_id is set to msg.sender during deployment (owner)
            // callback(address sender) expects the rvm_id which is owner.address
            await expect(
                funder.connect(callbackProxy).callback(owner.address)
            ).to.not.be.reverted;
            
            expect(await funder.totalCallbacks()).to.equal(1);
        });

        it("Should track callback statistics", async function () {
            const { funder, callbackProxy, owner } = await loadFixture(deployFunderFixture);
            
            // Use owner.address as the RVM ID (set in constructor)
            await funder.connect(callbackProxy).callback(owner.address);
            await funder.connect(callbackProxy).callback(owner.address);
            
            expect(await funder.totalCallbacks()).to.equal(2);
        });

        it("Should get funder status", async function () {
            const { funder, callbackProxy, owner } = await loadFixture(deployFunderFixture);
            
            await funder.connect(callbackProxy).callback(owner.address);
            
            const status = await funder.getStatus();
            expect(status._totalCallbacks).to.equal(1);
            expect(status._balance).to.equal(ethers.parseEther("5"));
        });
    });

    // ================== Integration Tests ==================
    describe("Full System Integration", function () {
        it("Should create funder via factory", async function () {
            const { funderFactory, devAccount, callbackContract, reactiveContract, owner } = 
                await loadFixture(deployFullSystemFixture);
            
            await funderFactory.createFunder(
                callbackContract.address,
                reactiveContract.address,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.1")
            );
            
            const funderAddr = await funderFactory.latestDeployed();
            expect(funderAddr).to.not.equal(ethers.ZeroAddress);
            
            // Whitelist the funder on dev account (caller responsibility)
            await devAccount.whitelist(funderAddr);
            
            // Check tracking
            expect(await funderFactory.funderCount()).to.equal(1);
            const funders = await funderFactory.getFundersByDev(owner.address);
            expect(funders.length).to.equal(1);
            expect(funders[0]).to.equal(funderAddr);
        });

        it("Should properly whitelist funder on dev account", async function () {
            const { funderFactory, devAccount, callbackContract, reactiveContract } = 
                await loadFixture(deployFullSystemFixture);
            
            await funderFactory.createFunder(
                callbackContract.address,
                reactiveContract.address,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.1")
            );
            
            const funderAddr = await funderFactory.latestDeployed();
            
            // Whitelist the funder manually (factory doesn't do it automatically)
            await devAccount.whitelist(funderAddr);
            
            // Check whitelist
            expect(await devAccount.isWhitelisted(funderAddr)).to.be.true;
        });

        it("Should create funder with custom funding", async function () {
            const { funderFactory, devAccount, callbackContract, reactiveContract } = 
                await loadFixture(deployFullSystemFixture);
            
            const initialFunding = ethers.parseEther("3");
            
            await funderFactory.createFunderWithFunding(
                callbackContract.address,
                reactiveContract.address,
                ethers.parseEther("0.5"),
                ethers.parseEther("0.1"),
                await devAccount.getAddress(),
                { value: initialFunding }
            );
            
            const funderAddr = await funderFactory.latestDeployed();
            expect(funderAddr).to.not.equal(ethers.ZeroAddress);
            
            // Check funder has the initial funding
            expect(await ethers.provider.getBalance(funderAddr)).to.equal(initialFunding);
        });
    });
});
