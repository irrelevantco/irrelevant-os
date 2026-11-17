"""Package the current standalone Next build with a pinned, checksum-verified Electron runtime."""
import argparse,hashlib,json,pathlib,shutil,urllib.request,zipfile
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--platform',choices=['win32','linux'],default='win32');parser.add_argument('--output',default='work/desktop-release');args=parser.parse_args()
version='45.3.4';name=f'electron-v{version}-{args.platform}-x64.zip'
cache=root/'work'/'electron-cache';cache.mkdir(parents=True,exist_ok=True)
base=f'https://github.com/electron/electron/releases/download/v{version}/'
def fetch(name):
 target=cache/name
 if not target.exists():
  print('Downloading official Electron asset:',name,flush=True)
  with urllib.request.urlopen(base+name,timeout=120) as response,target.open('wb') as output:shutil.copyfileobj(response,output)
 return target
sums=fetch('SHASUMS256.txt').read_text();expected=next(line.split()[0] for line in sums.splitlines() if line.split()[-1].lstrip('*')==name)
runtime=fetch(name);actual=hashlib.file_digest(runtime.open('rb'),'sha256').hexdigest()
if actual!=expected:raise SystemExit('Electron checksum mismatch; archive was not used.')
standalone=root/'.next'/'standalone'
if not (standalone/'server.js').exists():raise SystemExit('Run npm run build first (standalone output required).')
out=(root/args.output).resolve();out.mkdir(parents=True,exist_ok=True);app_dir=out/f'iRRELEVANT-OS-{args.platform}-x64'
if app_dir.exists():shutil.rmtree(app_dir)
app_dir.mkdir()
with zipfile.ZipFile(runtime) as archive:archive.extractall(app_dir)
if args.platform=='win32':(app_dir/'electron.exe').rename(app_dir/'iRRELEVANT OS.exe')
else:(app_dir/'electron').chmod(0o755);(app_dir/'chrome-sandbox').chmod(0o755);(app_dir/'chrome_crashpad_handler').chmod(0o755)
app=app_dir/'resources'/'app';app.mkdir()
for file in (root/'desktop').iterdir():
 if file.is_file():shutil.copy2(file,app/file.name)
def ignore(_directory,names):return [n for n in names if n.startswith('.env') or n in ['work','.git'] or n.endswith('.tsbuildinfo')]
shutil.copytree(standalone,app/'web',ignore=ignore)
shutil.copytree(root/'.next'/'static',app/'web'/'.next'/'static',dirs_exist_ok=True)
shutil.copytree(root/'public',app/'web'/'public',dirs_exist_ok=True)
# The standalone tracer may omit the fs-loaded example CSV; include only the authorized source file.
(app/'web'/'data'/'imports').mkdir(parents=True,exist_ok=True)
shutil.copy2(root/'data'/'imports'/'irrelevant_os_30_prospects.csv',app/'web'/'data'/'imports'/'irrelevant_os_30_prospects.csv')
readme=root/'docs'/'PERSONAL_APP.md'
if readme.exists():shutil.copy2(readme,app_dir/'START-HERE.md')
for file in app.rglob('*'):
 if file.is_file() and (file.name.startswith('.env') or file.name in ['hosts.yml','local-owner.json','stack.env']):raise SystemExit('Private environment file in package; refusing delivery.')
manifest={'app_version':'0.2.0','electron_version':version,'runtime_sha256':actual,'platform':args.platform,'architecture':'x64','backend_credentials_included':False}
(app_dir/'BUILD-INFO.json').write_text(json.dumps(manifest,indent=2)+'\n')
if args.platform=='win32':
 archive_path=pathlib.Path(shutil.make_archive(str(out/'iRRELEVANT-OS-Windows-x64-v0.2.0'),'zip',out,app_dir.name))
 checksum=hashlib.file_digest(archive_path.open('rb'),'sha256').hexdigest();archive_path.with_suffix('.zip.sha256').write_text(checksum+'  '+archive_path.name+'\n')
 print('Packaged:',archive_path,'\nSHA256:',checksum)
else:print('Linux smoke-test runtime:',app_dir/'electron')
