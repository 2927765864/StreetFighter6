# Character art prepare (Ryu)

See:

- `docs/character-art-consensus-v0.md`
- `docs/plans/ai-execution-plan-character-art-textures-v1.md`

## Commands

```bash
# A0–A4: PNG prepare (from interim, write-only to prepared/)
python3 tools/character_art/prepare_ryu_textures.py

# A5: bind + export glb + previews (Blender 5.2, real user config)
"/Users/yangjianlin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender" \
  --background --python tools/character_art/bind_export_ryu_glb.py

# Optional: copy to public for Vite without private-runtime
cp -f private/runtime/ryu/ryu_c1_textured.glb app/public/models/ryu/ryu_c1_textured.glb
```

Requires: Python 3, Pillow, NumPy.
