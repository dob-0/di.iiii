"""Make the folders the frames are about to land in.

`colab upload` goes through Jupyter's contents API, which will not create a
missing parent directory — it answers 500 Internal Server Error, which reads
like a broken server and is really "that folder is not there" (a whole
afternoon, 2026-09-21).

Run this on the box before the first upload.
"""
import json
import os

for folder in ('/content/parts', '/content/place'):
    os.makedirs(folder, exist_ok=True)

print('PLACE_STATUS ' + json.dumps({'state': 'ready', 'folders': ['/content/parts', '/content/place']}))
