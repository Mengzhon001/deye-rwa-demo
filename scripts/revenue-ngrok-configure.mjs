import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {dir} from './revenue-remote.mjs';
if(!process.stdin.isTTY)throw Error('Run this command in your own Terminal. Do not put the token in chat or command arguments.');
mkdirSync(dir,{recursive:true,mode:0o700});
let muted=false;
const hidden=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
const rl=createInterface({input:process.stdin,output:hidden,terminal:true});
process.stdout.write('Paste your ngrok authtoken (hidden), then press Enter: ');muted=true;
try{
 const token=await new Promise((resolve,reject)=>{rl.question('',resolve);rl.once('SIGINT',()=>reject(Error('Cancelled')));});
 if(!/^[a-zA-Z0-9_:-]{20,200}$/.test(token.trim()))throw Error('Token format was not recognized. Nothing was saved.');
 const file=join(dir,'ngrok.yml');
 writeFileSync(file,'version: "2"\nauthtoken: '+JSON.stringify(token.trim())+'\nweb_addr: 127.0.0.1:4049\n',{mode:0o600});chmodSync(file,0o600);
 process.stdout.write('\nSaved the token locally. No token was printed or sent to GitHub.\n');
}catch(e){process.stdout.write('\n'+e.message+'\n');process.exitCode=1;}finally{rl.close();}
