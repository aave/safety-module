import BigNumber from 'bignumber.js';

const chai = require('chai');
const {expect, assert} = chai;
const ChaiBigNumber = require('chai-bignumber');

import {ethers, ContractTransaction, BigNumberish} from 'ethers';

import {StakedAave} from '../../../types/StakedAave';

import {getRewards} from '../../DistributionManager/data-helpers/base-math';
import {getUserIndex} from '../../DistributionManager/data-helpers/asset-user-data';
import {eventChecker} from '../../helpers/comparator-engine';
import {waitForTx, increaseTime} from '../../../helpers/misc-utils';
import {SignerWithAddress} from '../../helpers/make-suite';

chai.use(ChaiBigNumber());

type AssetConfig = {
  totalStaked: BigNumberish;
  emissionPerSecond: BigNumberish;
};

export const compareRewardsAtAction = async (
  stakedAave: StakedAave,
  userAddress: string,
  actions: () => Promise<ContractTransaction>[],
  shouldReward?: boolean,
  assetConfig?: AssetConfig
): Promise<void> => {
  const underlyingAsset = stakedAave.address;
  // To prevent coverage to fail, add 5 seconds per comparisson.
  await increaseTime(5);

  const rewardsBalanceBefore = new BigNumber(
    await (await stakedAave.getTotalRewardsBalance(userAddress)).toString()
  );

  // Configure assets of stake token
  const assetConfiguration = assetConfig
    ? {
        ...assetConfig,
        underlyingAsset,
      }
    : {
        emissionPerSecond: '100',
        totalStaked: await stakedAave.totalSupply(),
        underlyingAsset,
      };
  await stakedAave.configureAssets([assetConfiguration]);

  const userBalance = await stakedAave.balanceOf(userAddress);
  // Get index before actions
  const userIndexBefore = await getUserIndex(stakedAave, userAddress, underlyingAsset);

  // Dispatch actions that can or not update the user index
  const receipts: ethers.ContractReceipt[] = await Promise.all(
    await actions().map(async (action) => waitForTx(await action))
  );
  // Get index after actions
  const userIndexAfter = await getUserIndex(stakedAave, userAddress, underlyingAsset);

  // Compare calculated JS rewards versus Solidity user rewards
  const rewardsBalanceAfter = new BigNumber(
    await (await stakedAave.getTotalRewardsBalance(userAddress)).toString()
  );
  const expectedAccruedRewards = getRewards(userBalance, userIndexAfter, userIndexBefore);

  expect(rewardsBalanceAfter).to.bignumber.eq(rewardsBalanceBefore.plus(expectedAccruedRewards));

  // Explicit check rewards when the test case expects rewards to the user
  if (shouldReward) {
    expect(expectedAccruedRewards).to.be.bignumber.gt(0);
  } else {
    expect(expectedAccruedRewards).to.be.bignumber.eq(0);
    expect(rewardsBalanceAfter).to.be.bignumber.eq(rewardsBalanceBefore);
  }

  // Check the reward event values if any in the latest tx receipt
  if (expectedAccruedRewards.gt('0')) {
    const latestReceipt = receipts[receipts.length - 1];
    const eventAccrued = latestReceipt.events?.find(({event}) => event === 'RewardsAccrued');
    if (eventAccrued) {
      eventChecker(eventAccrued, 'RewardsAccrued', [
        userAddress,
        expectedAccruedRewards.toString(),
      ]);
    } else {
      assert.fail('RewardsAccrued event must be emitted');
    }
  }
};

export const compareRewardsAtTransfer = async (
  stakedAave: StakedAave,
  from: SignerWithAddress,
  to: SignerWithAddress,
  amount: BigNumberish,
  fromShouldReward?: boolean,
  toShouldReward?: boolean,
  assetConfig?: AssetConfig
): Promise<void> => {
  // Increase time to prevent coverage to fail
  await increaseTime(5);

  const fromAddress = from.address;
  const toAddress = to.address;
  const underlyingAsset = stakedAave.address;
  const fromSavedBalance = await stakedAave.balanceOf(fromAddress);
  const toSavedBalance = await stakedAave.balanceOf(toAddress);
  const fromSavedRewards = new BigNumber(
    await (await stakedAave.getTotalRewardsBalance(fromAddress)).toString()
  );
  const toSavedRewards = new BigNumber(
    await (await stakedAave.getTotalRewardsBalance(toAddress)).toString()
  );
  // Get index before actions
  const fromIndexBefore = await getUserIndex(stakedAave, fromAddress, underlyingAsset);
  const toIndexBefore = await getUserIndex(stakedAave, toAddress, underlyingAsset);

  // Load actions that can or not update the user index
  const actions = () => [stakedAave.connect(from.signer).transfer(toAddress, amount)];

  // Fire reward comparator
  await compareRewardsAtAction(stakedAave, fromAddress, actions, fromShouldReward, assetConfig);

  // Check rewards after transfer

  // Get index after actions
  const fromIndexAfter = await getUserIndex(stakedAave, fromAddress, underlyingAsset);
  const toIndexAfter = await getUserIndex(stakedAave, toAddress, underlyingAsset);

  // FROM: Compare calculated JS rewards versus Solidity user rewards
  const fromRewardsBalanceAfter = new BigNumber(
    await (await stakedAave.getTotalRewardsBalance(fromAddress)).toString()
  );
  const fromExpectedAccruedRewards = getRewards(fromSavedBalance, fromIndexAfter, fromIndexBefore);
  expect(fromRewardsBalanceAfter).to.bignumber.eq(
    fromSavedRewards.plus(fromExpectedAccruedRewards)
  );

  // TO: Compare calculated JS rewards versus Solidity user rewards
  const toRewardsBalanceAfter = new BigNumber(
    await (await stakedAave.getTotalRewardsBalance(toAddress)).toString()
  );
  const toExpectedAccruedRewards = getRewards(toSavedBalance, toIndexAfter, toIndexBefore);
  expect(toRewardsBalanceAfter).to.bignumber.eq(toSavedRewards.plus(toExpectedAccruedRewards));

  // Explicit check rewards when the test case expects rewards to the user
  if (fromShouldReward) {
    expect(fromExpectedAccruedRewards).to.be.bignumber.gt(0);
  } else {
    expect(fromExpectedAccruedRewards).to.be.bignumber.eq(0);
  }

  // Explicit check rewards when the test case expects rewards to the user
  if (toShouldReward) {
    expect(toExpectedAccruedRewards).to.be.bignumber.gt(0);
  } else {
    expect(toExpectedAccruedRewards).to.be.bignumber.eq(0);
  }

  // Expect new balances
  if (fromAddress === toAddress) {
    expect(fromSavedBalance.toString()).to.be.equal(toSavedBalance.toString());
  } else {
    const fromNewBalance = await (await stakedAave.balanceOf(fromAddress)).toString();
    const toNewBalance = await (await stakedAave.balanceOf(toAddress)).toString();
    expect(fromNewBalance).to.be.equal(fromSavedBalance.sub(amount).toString());
    expect(toNewBalance).to.be.equal(toSavedBalance.add(amount).toString());
  }
};
