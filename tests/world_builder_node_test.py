"""Real tensor/media tests; no Comfy server or model inference required."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import types
import unittest
import wave

import numpy as np

# The node also looks beside a bare PATH (ComfyUI Desktop on macOS); so does this guard.
FFMPEG=shutil.which('ffmpeg') or next((str(Path(d)/'ffmpeg') for d in ('/opt/homebrew/bin','/usr/local/bin','/opt/local/bin') if (Path(d)/'ffmpeg').is_file()),None)
import torch
from PIL import Image

REPO = Path(__file__).resolve().parents[1]

class WorldBuilderNodes(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        folders = types.ModuleType('folder_paths')
        folders.get_input_directory = lambda: str(self.root)
        folders.get_temp_directory = lambda: str(self.root)
        sys.modules['folder_paths'] = folders
        package = REPO / 'custom_nodes/director_world_builder'
        spec = importlib.util.spec_from_file_location('world_node', package / '__init__.py', submodule_search_locations=[str(package)])
        self.node = importlib.util.module_from_spec(spec)
        sys.modules['world_node'] = self.node
        spec.loader.exec_module(self.node)
        self.recipe = json.dumps({'version': 1, 'fps': 24, 'width': 256, 'height': 256, 'frames': 9})
        Image.new('RGB', (256, 256), '#ee8822').save(self.root / 'frame.png')

    def tearDown(self):
        self.temp.cleanup()

    def test_png_and_silence(self):
        frames,audio,fps,recipe,depth,edges = self.node.DirectorSceneCapture().capture('frame.png','',self.recipe)
        self.assertEqual(tuple(frames.shape),(1,256,256,3))
        self.assertEqual(tuple(audio['waveform'].shape),(1,1,2000))
        self.assertEqual(fps,24)
        self.assertEqual(recipe,self.recipe)
        self.assertAlmostEqual(float(frames[0,0,0,0]),238/255,places=5)

    def test_path_and_memory_guards(self):
        for name in ['../outside.png','https://example.com/a.png','frame.txt']:
            with self.assertRaises(ValueError):self.node.input_path(name,{'.png'})
        outside=self.root.parent / (self.root.name+'-outside.png')
        try:
            Image.new('RGB',(1,1)).save(outside)
            (self.root/'link.png').symlink_to(outside)
            with self.assertRaises(ValueError):self.node.input_path('link.png',{'.png'})
        finally:outside.unlink(missing_ok=True)
        with self.assertRaises(ValueError):self.node.recipe_data(json.dumps({'version':1,'fps':24,'width':1920,'height':1920,'frames':241}))
        with self.assertRaises(ValueError):self.node.recipe_data('{}')

    def test_content_hash_invalidates_same_filename(self):
        cls=self.node.DirectorSceneCapture
        before=cls.IS_CHANGED('frame.png','',self.recipe)
        Image.new('RGB',(256,256),'blue').save(self.root/'frame.png')
        self.assertNotEqual(before,cls.IS_CHANGED('frame.png','',self.recipe))

    @unittest.skipUnless(FFMPEG,'FFmpeg unavailable')
    def test_generated_audio_video_round_trip(self):
        images=torch.zeros((9,256,256,3));images[:4,:,:,0]=1;images[4:,:,:,2]=1
        waveform=torch.ones((1,1,18000))*0.25
        result=self.node.DirectorSceneInputs().prepare(24,images,{'waveform':waveform,'sample_rate':48000})
        refs=result['ui']['world_inputs'][0]
        frames,audio,fps,_,_,_=self.node.DirectorSceneCapture().capture(refs['screen'][0]['filename'],refs['soundtrack'][0]['filename'],self.recipe)
        self.assertEqual(tuple(frames.shape),(9,256,256,3))
        self.assertGreater(float(frames[0,:,:,0].mean()),.9)
        self.assertGreater(float(frames[8,:,:,2].mean()),.9)
        self.assertEqual(tuple(audio['waveform'].shape),(1,1,18000))
        self.assertAlmostEqual(float(audio['waveform'].mean()),.25,places=3)
        self.assertEqual(fps,24)
        wrong = json.loads(self.recipe); wrong['frames'] = 17
        with self.assertRaises(ValueError):
            self.node.DirectorSceneCapture().capture(refs['screen'][0]['filename'],'',json.dumps(wrong))

if __name__=='__main__':unittest.main()
