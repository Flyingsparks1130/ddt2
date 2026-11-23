import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {copyFile, mkdtemp, rm} from 'node:fs/promises';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

test('the Windows launcher retires only the confirmed, idle Helper from its own folder', {timeout:20000}, async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'helper-launch-test-'));
    const runtime = path.join(temp, 'node.exe');
    const fixture = "const http=require('node:http');const server=http.createServer((req,res)=>res.end(JSON.stringify({version:'0.6.2',revision:25,tournament:{},activeHeatId:null,armedHeatId:null,bridge:{active:false}})));server.listen(0,'127.0.0.1',()=>process.send(server.address().port));";
    const testExe = fileURLToPath(new URL('../HelperHandoffTest.exe', import.meta.url));
    let child;
    try {
        await copyFile(process.execPath, runtime);
        child = spawn(runtime, ['-e',fixture], {stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
        const [port] = await once(child,'message');
        const exit = once(child,'exit');
        await promisify(execFile)(testExe,[String(port),runtime],{windowsHide:true,timeout:10000});
        assert.equal((await exit)[0],0);
    } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
            const exited=once(child,'exit');
            child.kill();
            await exited;
        }
        await rm(temp,{recursive:true,force:true,maxRetries:3});
    }
});
