# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas = [('backend/config.py', 'backend'), ('backend/agent', 'backend/agent'), ('backend/models', 'backend/models'), ('backend/utils', 'backend/utils'), ('backend/voice_pipeline.py', 'backend'), ('backend/clipboard_store.py', 'backend'), ('backend/__init__.py', 'backend'), ('backend/agent/__init__.py', 'backend/agent'), ('backend/models/__init__.py', 'backend/models'), ('backend/models/intent.py', 'backend/models')]
binaries = []
hiddenimports = ['pydantic', 'fastapi', 'uvicorn', 'sqlite3', 'httpx', 'psutil', 'backend', 'backend.models', 'backend.agent', 'backend.utils']
tmp_ret = collect_all('backend')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['backend/main.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='aura-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
