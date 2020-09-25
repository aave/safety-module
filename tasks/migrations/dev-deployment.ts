import {task} from '@nomiclabs/buidler/config';
import {eContractid} from '../../helpers/types';
import {BuidlerRuntimeEnvironment} from '@nomiclabs/buidler/types';
import {StakedAave} from '../../types/StakedAave';

task('dev-deployment', 'Deployment in buidlerevm').setAction(async (_, localBRE) => {
  const BRE: BuidlerRuntimeEnvironment = await localBRE.run('set-bre');

  const aaveStake = (await BRE.run(`deploy-${eContractid.StakedAave}`)) as StakedAave;
});
