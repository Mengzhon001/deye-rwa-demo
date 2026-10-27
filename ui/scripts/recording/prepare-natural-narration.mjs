import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {story} from './story.mjs';

const source=resolve(process.argv[2]||'.data/demo-recording/delivery');
const work=resolve('.data/demo-recording/natural-voice');
const edits=JSON.parse(readFileSync(join(source,'edit-index.json'),'utf8'));
assert.equal(edits.length,story.length);
mkdirSync(work,{recursive:true});
writeFileSync(join(work,'story.json'),JSON.stringify(story.map(([key,chapter,target,text],i)=>{
 assert.equal(edits[i].key,key);
 return {key,chapter,text,seconds:edits[i].end-edits[i].start,start:edits[i].start};
}),null,2));
console.log('Prepared '+story.length+' paragraphs against the existing validated edit.');
