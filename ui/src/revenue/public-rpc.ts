import {JsonRpcProvider,JsonRpcPayload,JsonRpcResult,JsonRpcError} from 'ethers';
/** Respect the anonymous Base RPC's per-method rate limit even when calls are batched. */
export class PublicReadProvider extends JsonRpcProvider {
  private reads:Promise<unknown>=Promise.resolve();
  override _getConnection(){
    const request=super._getConnection();
    // A stalled request must not occupy the serialized read queue for the
    // library's five-minute default, even after the browser has timed out.
    request.timeout=Math.min(request.timeout,10000);
    request.retryFunc=async()=>false;
    return request;
  }
  override _send(payload:JsonRpcPayload|JsonRpcPayload[]):Promise<JsonRpcResult[]>{
    const list=Array.isArray(payload)?payload:[payload];
    const readOnly=list.every(p=>/^eth_(call|get|blockNumber|chainId)/.test(p.method));
    const task=this.reads.then(async()=>{
      for(let attempt=0;;attempt++){
        await new Promise(r=>setTimeout(r,Math.max(100,list.length*100)));
        const results=await super._send(payload);
        const limited=(results as unknown as Array<JsonRpcResult|JsonRpcError>).some(r=>'error'in r&&(/limit|too many requests/i.test(r.error.message||'')||r.error.code===-32007));
        if(!limited||!readOnly||attempt>=3)return results;
        await new Promise(r=>setTimeout(r,1200*(attempt+1)));
      }
    });this.reads=task.catch(()=>{});return task;
  }
}
