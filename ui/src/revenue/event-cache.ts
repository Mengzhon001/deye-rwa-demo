import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import type {Provider, Log} from "ethers";
type Cached = {last:number;hash:string;logs:Log[];times:Record<string,number>};
/** RPC-safe, restartable event collection. Recheck the last 12 blocks for short reorgs. */
export class EventCache {
  private pending = new Map<string,Promise<{logs:Log[];times:Record<string,number>}>>();
  constructor(private provider: Provider,private folder:string,private historyProvider?:Provider,private historyPageSize=200){
    if(!Number.isInteger(historyPageSize)||historyPageSize<1||historyPageSize>50000)throw Error('Invalid historical event page size');
  }
  read(address:string,first:number) {
    const key=address.toLowerCase();
    const prior=this.pending.get(key);if(prior)return prior;
    const work=this.sync(key,first).finally(()=>this.pending.delete(key));this.pending.set(key,work);return work;
  }
  private async sync(address:string,first:number){
    const file=`${this.folder}/${address}.json`;
    let saved:Cached=existsSync(file)?JSON.parse(readFileSync(file,"utf8")):{last:first-1,hash:"",logs:[],times:{}};
    const latest=await this.provider.getBlock("latest");if(!latest)throw new Error("Latest block unavailable");
    if(saved.last>latest.number || saved.hash && (await this.provider.getBlock(saved.last))?.hash!==saved.hash)
      saved={last:first-1,hash:"",logs:[],times:{}};
    const from=Math.max(first,saved.last-11);
    const logs=saved.logs.filter(l=>l.blockNumber<from);
    // Keep recent/reorgable blocks on the primary RPC. A separately configured
    // history RPC may support larger ranges, but must agree on the boundary hash.
    const boundary=latest.number-12;
    let tail=from;
    if(this.historyProvider&&from<=boundary){
      const [primaryBlock,historyBlock]=await Promise.all([this.provider.getBlock(boundary),this.historyProvider.getBlock(boundary)]);
      if(!primaryBlock?.hash||historyBlock?.hash!==primaryBlock.hash)throw Error('Historical RPC does not match the primary chain');
      for(let n=from;n<=boundary;n+=this.historyPageSize){
        logs.push(...await this.historyProvider.getLogs({address,fromBlock:n,toBlock:Math.min(n+this.historyPageSize-1,boundary)}));
      }
      if((await this.provider.getBlock(boundary))?.hash!==primaryBlock.hash)throw Error('Historical event boundary reorganized during synchronization');
      tail=boundary+1;
    }
    // The primary public RPC enforces 200 blocks. Commit only after every page succeeds.
    for(let n=tail;n<=latest.number;n+=200)logs.push(...await this.provider.getLogs({address,fromBlock:n,toBlock:Math.min(n+199,latest.number)}));
    logs.sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index);
    const times=saved.times;
    for(const n of new Set(logs.filter(l=>l.blockNumber>=from||times[String(l.blockNumber)]===undefined).map(l=>l.blockNumber))){
      const block=await this.provider.getBlock(n);if(!block)throw new Error("Event block unavailable");times[String(n)]=block.timestamp;
    }
    const next={last:latest.number,hash:latest.hash!,logs,times};
    mkdirSync(dirname(file),{recursive:true});writeFileSync(file+".tmp",JSON.stringify(next),{mode:0o600});renameSync(file+".tmp",file);
    return {logs,times};
  }
}
