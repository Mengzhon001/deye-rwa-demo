import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import type {Provider, Log} from "ethers";
type Cached = {last:number;hash:string;logs:Log[];times:Record<string,number>};
/** RPC-safe, restartable event collection. Recheck the last 12 blocks for short reorgs. */
export class EventCache {
  private pending = new Map<string,Promise<{logs:Log[];times:Record<string,number>}>>();
  constructor(private provider: Provider,private folder:string){}
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
    // Base public RPC enforces a 200-block query limit. The cursor commits only after all pages succeed.
    for(let n=from;n<=latest.number;n+=200){
      const page=await this.provider.getLogs({address,fromBlock:n,toBlock:Math.min(n+199,latest.number)});
      logs.push(...page);
    }
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
