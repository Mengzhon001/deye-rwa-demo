import {createServer, request as httpRequest} from 'node:http';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {resolve, join, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf','.zip':'application/zip','.woff2':'font/woff2'};
const assetAliases={'/guidance-driver.js':'vendor/driver-1.9.0.js','/guidance-driver.css':'vendor/driver-1.9.0.css'};
export function createGateway(config) {
  const networks=config.networks;
  if(networks.length!==2 || networks.some(n=>!['private','base-sepolia'].includes(n.id)) || new Set(networks.map(n=>n.chainId)).size!==2)throw Error('Two distinct, configured test networks required');
  for(const n of networks){const u=new URL(n.upstream);if(!['127.0.0.1','localhost','host.docker.internal'].includes(u.hostname)||u.protocol!=='http:'||u.pathname!=='/')throw Error('Only fixed local application backends are allowed');}
  const hosts=new Set(config.origins.map(o=>new URL(o).host));
  const publicOrigins=new Set(config.publicReadOrigins||[]);
  const assets=resolve(config.assets),site=resolve(config.site);
  return createServer((req,res)=>{
    if(!hosts.has(req.headers.host)){res.writeHead(403);return res.end('Unrecognized application host');}
    const url=new URL(req.url,'http://'+req.headers.host),path=url.pathname;
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(path==='/networks.json'&&req.method==='GET')return json(200,{version:1,defaultNetwork:'private',networks:networks.map(({id,chainId,label})=>({id,chainId,label,appPath:`/networks/${id}/app/`}))});
    const match=path.match(/^\/networks\/(private|base-sepolia)(\/.*)$/);
    const network=networks.find(n=>n.id===(match?.[1]||'private'));
    const localPath=match?.[2]||path;
    const publicRead=['/api/public/overview','/api/public/deployment'].includes(localPath);
    if(localPath.startsWith('/api/')){
      // A missing namespace is allowed only for public metadata and the network descriptor.
      if(!match&&!publicRead&&localPath!=='/api/network')return json(400,{error:'Select a network before signing in or submitting an operation'});
      if(req.method!=='GET' && (!config.origins.includes(req.headers.origin)||!String(req.headers['content-type']||'').startsWith('application/json')))return json(403,{error:'Same-origin JSON request required'});
      const target=new URL(network.upstream);
      const headers={...req.headers,host:req.headers.host};
      // Each chain accepts only its own backend session; cookies never select an upstream.
      headers.cookie=(req.headers.cookie||'').split(';').map(c=>c.trim()).filter(c=>c.startsWith(network.cookieName+'=')).join('; ');
      delete headers['x-forwarded-host'];delete headers['x-forwarded-for'];delete headers['x-forwarded-proto'];
      const upstream=httpRequest({hostname:target.hostname,port:target.port,path:localPath+url.search,method:req.method,headers,timeout:120000},response=>{
        const h={...response.headers};delete h['access-control-allow-origin'];delete h['access-control-allow-credentials'];
        if(publicRead&&req.method==='GET'&&publicOrigins.has(req.headers.origin)){h['access-control-allow-origin']=req.headers.origin;h.vary='Origin';}
        if(h['set-cookie'])h['set-cookie']=h['set-cookie'].map(c=>c.replace(/Path=\/([;]|$)/,`Path=/networks/${network.id}/$1`));
        res.writeHead(response.statusCode||502,h);response.pipe(res);
      });
      upstream.on('timeout',()=>upstream.destroy(Error('Backend timed out')));
      upstream.on('error',()=>{if(!res.headersSent)json(503,{error:'The selected network service is unavailable. Your other network and on-chain funds are unaffected.'});else res.destroy();});
      req.on('aborted',()=>upstream.destroy());req.pipe(upstream);return;
    }
    if(!['GET','HEAD'].includes(req.method))return json(405,{error:'Method not allowed'});
    if(path==='/app/'||path==='/app'){
      res.writeHead(302,{Location:'/networks/private/app/'+url.search,'Cache-Control':'no-store'});return res.end();
    }
    let root,file;
    if(match && /^\/app\/(?:recording\/)?$/.test(localPath)){root=assets;file=localPath.includes('recording')?'recording.html':'index.html';}
    else if(!match && assetAliases[path]){root=assets;file=assetAliases[path];}
    else if(!match && /^[\w.-]+\.(js|css)$/.test(path.slice(1))){root=assets;file=path.slice(1);}
    else if(!match){root=site;try{file=path==='/'||path.startsWith('/docs/')?'index.html':decodeURIComponent(path).slice(1);}catch{return json(400,{error:'Invalid path'});}}
    else return json(404,{error:'Not found'});
    let full=resolve(root,file);
    if(full!==root&&!full.startsWith(root+sep))return json(404,{error:'Not found'});
    if(existsSync(full)&&statSync(full).isDirectory())full=join(full,'index.html');
    if(!existsSync(full)||!statSync(full).isFile())return json(404,{error:'Not found'});
    const body=readFileSync(full);res.writeHead(200,{'Content-Type':types[extname(full)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const config=JSON.parse(readFileSync(process.argv[2]));
  createGateway(config).listen(config.port,config.host||'127.0.0.1',()=>console.log(`Unified app listening on ${config.port}`));
}
