"""Package distributable sources and model/runtime assets, excluding local dependencies/data."""
import pathlib,zipfile
root=pathlib.Path(__file__).resolve().parents[1]
output=root.parent/'no-coin-pilot.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(root.rglob('*')):
        if not p.is_file() or any(part in {'node_modules','__pycache__','.git'} for part in p.relative_to(root).parts):continue
        if p.suffix=='.pyc':continue
        z.write(p,p.relative_to(root))
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    assert not any('node_modules/' in n for n in z.namelist())
    print('Packaged',len(z.namelist()),'files;',output.stat().st_size,'bytes')
