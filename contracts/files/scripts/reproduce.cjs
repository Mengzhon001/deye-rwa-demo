const fs=require('node:fs'),assert=require('node:assert/strict'),solc=require('solc');
const input=JSON.parse(fs.readFileSync('compiler-input.json')),manifest=JSON.parse(fs.readFileSync('build-manifest.json'));
assert.equal(solc.version(),manifest.compiler);const result=JSON.parse(solc.compile(JSON.stringify(input)));
assert.equal((result.errors||[]).filter(e=>e.severity==='error').length,0);
for(const c of manifest.contracts){const actual=result.contracts[c.source][c.name];assert.equal(actual.evm.deployedBytecode.object,c.runtimeBytecode);assert.deepEqual(actual.abi,c.abi);console.log('PASS '+c.name+' bytecode and ABI');}
