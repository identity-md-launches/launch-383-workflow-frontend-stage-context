// Build an isolated snapshot solely to measure the full Git bundle. The real .git is never written.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, mkdtemp, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../',import.meta.url))
const git = (...args) => execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()
const entries = (...args) => execFileSync('git',args,{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)
const tracked = entries('ls-files','-z')
const changed = [...entries('diff','--name-only','-z'),...entries('diff','--cached','--name-only','-z'),...entries('ls-files','--others','--exclude-standard','-z')].filter(p=>!p.startsWith('test/scratch/'))
const allowed = p => p==='web/.gitignore' || /^(web|dist|docs)\//.test(p) && !p.split('/').some(part=>part.startsWith('.'))
if(changed.some(p=>!allowed(p)))throw Error('Out-of-scope changes: '+changed.filter(p=>!allowed(p)).join(', '))
if(git('ls-files','--stage').split('\n').some(line=>line.startsWith('160000 ')))throw Error('Unexpected Git submodule')
const files = [...new Set([...tracked,...changed])].sort()
if(files.some(p=>/(^|\/)(node_modules|\.cache|\.npm|vendor\/npm|playwright-report|test-results)(\/|$)|\.tgz$/.test(p)))throw Error('Dependency/cache artifact in prospective submission')
let rawBytes = 0
for(const file of files) rawBytes += (await stat(root+file)).size
const ignoreBytes=(await readFile(root+'web/.gitignore')).length
if(ignoreBytes>1024)throw Error('web/.gitignore exceeds its explicit 1 KiB budget')
await mkdir(root+'test/scratch',{recursive:true})
const scratch=await mkdtemp(root+'test/scratch/pawn-budget-'), repo=scratch+'/repository.git'
execFileSync('git',['clone','--bare','--no-hardlinks','--quiet',root,repo],{cwd:root})
const isolated=(...args)=>execFileSync('git',[`--git-dir=${repo}`,`--work-tree=${root}`,...args],{cwd:root,encoding:'utf8'})
isolated('read-tree','HEAD')
await writeFile(scratch+'/paths',files.join('\0')+'\0')
isolated('add','--pathspec-from-file='+scratch+'/paths','--pathspec-file-nul')
isolated('-c','user.name=Frontend validation','-c','user.email=validation@invalid','commit','-q','-m','Prospective frontend submission for byte-budget validation')
isolated('bundle','create',scratch+'/submission.bundle','--all')
const bundleBytes=(await stat(scratch+'/submission.bundle')).size
// Reserve space for this report, which is written after the measured snapshot.
const reportReserve=65536
if(bundleBytes+reportReserve>8388608)throw Error('Complete bundle exceeds 8 MiB budget')
const report={result:'PASS',measuredAt:new Date().toISOString(),sourceCommit:git('rev-parse','HEAD'),scopeCheck:'Only web/**, dist/**, docs/** and web/.gitignore; scratch excluded',trackedSourcePreserved:git('diff','--name-only','HEAD','--','src','foundry.toml','remappings.txt','lib','.github','launch.json')==='',prospectiveFiles:files.length,rawFileBytes:rawBytes,bundleBytes,reportReserveBytes:reportReserve,maximumBytes:8388608,ignorePath:'web/.gitignore',ignoreBudgetBytes:1024,ignoreActualBytes:ignoreBytes,submodules:0,dependencyArtifacts:0,realRepositoryCommitted:false,note:'Measured a complete clone-history bundle with a prospective snapshot in test/scratch only. The real .git is read-only. Report reserve covers this evidence file added after measurement; scratch bundle is not submitted.'}
await writeFile(root+'docs/evidence/submission-budget.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
