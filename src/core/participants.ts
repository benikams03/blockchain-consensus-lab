import type { Config } from './types.js';

/** Empty/missing list is a legacy shorthand for all positive-resource nodes, or all nodes. */
export function consensusIndices(c: Pick<Config, 'nodeCount' | 'resources'> & { consensusNodes?: number[] }): number[] {
  return c.consensusNodes?.length ? [...c.consensusNodes] : c.resources?.length ? c.resources.flatMap((w,i)=>w>0?[i]:[]) : Array.from({length:c.nodeCount},(_,i)=>i);
}
export const committeeIds = (c: Config) => consensusIndices(c).map(i=>'n'+i);
export function controlledIndices(c: Config): number[] {
  return consensusIndices(c).slice(0,c.attack==='byzantine'?c.faultyNodes:['majority','double'].includes(c.attack)?1:0);
}
export function resourceWeights(c: Config): number[] {
  const selected=consensusIndices(c), weights=Array(c.nodeCount).fill(0) as number[];
  if(c.protocol==='pbft'){for(const i of selected)weights[i]=1;return weights;}
  if(c.resources.length)return [...c.resources];
  const faults=controlledIndices(c), honest=selected.filter(i=>!faults.includes(i));
  const fill=(ids:number[],total:number)=>ids.forEach((id,i)=>weights[id]=Math.floor(total/ids.length)+(i<total%ids.length?1:0));
  if(!faults.length)fill(selected,selected.length*10000);
  else { const controlled=Math.round(c.attackerShare*1000000);fill(faults,controlled);fill(honest,1000000-controlled); }
  return weights;
}
