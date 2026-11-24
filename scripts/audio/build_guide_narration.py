"""Render bilingual tour clips with Piper and Zerre. Run from the repository root."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
import wave

import numpy as np
import onnxruntime as ort
from piper import PiperVoice, SynthesisConfig


def run_node(source, *args, data=None):
    result = subprocess.run(
        ["node", "--input-type=module", "-e", source, *map(str, args)],
        input=data, capture_output=True, check=True, encoding="utf-8",
    )
    return json.loads(result.stdout)


def tour_sentences():
    return run_node("""
        import {getGuideTopics} from './client/src/components/guide/guidePresentation.js';
        const split = (text) => text.match(/[^.!?]+(?:[.!?]+|$)/g).map(line => line.trim());
        console.log(JSON.stringify(Object.fromEntries(['en', 'tr'].map(lang => [
          lang, getGuideTopics(lang).flatMap(topic => split(topic.narration)),
        ]))));
    """)


def turkish_tokens(sentences, phonemizer, lexicon):
    spoken = [line.replace("UR10e", "u re on e").replace("MongoDB", "Mongo di bi")
              .replace("API", "ey pi ay").replace("R1", "re bir").replace("R2", "re iki")
              for line in sentences]
    return run_node("""
        import fs from 'node:fs';
        import vm from 'node:vm';
        const lexicon = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
        vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
        const lines = JSON.parse(fs.readFileSync(0, 'utf8'));
        console.log(JSON.stringify(lines.map(line => zerre.phonemize(line, lexicon, lexicon.symbols))));
    """, phonemizer, lexicon, data=json.dumps(spoken))


def render_turkish(session, tokens, destination):
    def scalar(value):
        return np.array([value], dtype=np.float32)

    samples, = session.run(["audio"], {
        "tokens": np.array([tokens["ids"]], dtype=np.int64),
        "stress": np.array([tokens["stress"]], dtype=np.int64),
        "voice": np.array([0], dtype=np.int64),
        "speed": scalar(1.04),
        "pitch_shift": scalar(0),
        "pitch_range": scalar(1),
    })
    with wave.open(str(destination), "wb") as output:
        output.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        output.writeframes((samples.clip(-1, 1) * 32767).astype("<i2").tobytes())


def render_english(voice, sentence, destination):
    spoken = (sentence.replace("UR10e", "U R ten E").replace("MongoDB", "Mongo D B")
              .replace("API", "A P I").replace("R1", "R one").replace("R2", "R two"))
    with wave.open(str(destination), "wb") as output:
        voice.synthesize_wav(spoken, output, syn_config=SynthesisConfig(length_scale=0.95))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("piper", "zerre", "phonemizer", "lexicon"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--reuse-existing", action="store_true", help="Keep clips whose text is unchanged")
    args = parser.parse_args()
    sentences = tour_sentences()
    piper = PiperVoice.load(args.piper)
    zerre = ort.InferenceSession(str(args.zerre), providers=["CPUExecutionProvider"])
    tokens = turkish_tokens(sentences["tr"], args.phonemizer, args.lexicon)
    assets = Path("client/public/assets/audio/guide")
    assets.mkdir(parents=True, exist_ok=True)
    manifest_path = Path("client/src/components/guide/narrationClips.json")
    previous = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest = {}
    with TemporaryDirectory(dir=Path("client/node_modules/.cache")) as directory:
        wav = Path(directory, "narration.wav")
        mp3 = wav.with_suffix(".mp3")
        for lang, lines in sentences.items():
            manifest[lang] = {}
            for index, sentence in enumerate(lines):
                existing = previous.get(lang, {}).get(sentence, "")
                if (args.reuse_existing and re.fullmatch(r"(en|tr)-\d+-[0-9a-f]{10}\.mp3", existing)
                        and (assets / existing).is_file()):
                    manifest[lang][sentence] = existing
                    continue
                if lang == "en":
                    render_english(piper, sentence, wav)
                else:
                    render_turkish(zerre, tokens[index], wav)
                subprocess.run([
                    "ffmpeg", "-loglevel", "error", "-y", "-i", str(wav),
                    "-af", "highpass=f=75,loudnorm=I=-19:TP=-2:LRA=6",
                    "-ar", "24000", "-ac", "1", "-b:a", "56k", str(mp3),
                ], check=True)
                data = mp3.read_bytes()
                digest = hashlib.sha256(data).hexdigest()[:10]
                file = f"{lang}-{index + 1:02d}-{digest}.mp3"
                (assets / file).write_bytes(data)
                manifest[lang][sentence] = file
                print(file, len(data), flush=True)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    retained = {name for clips in manifest.values() for name in clips.values()}
    for name in {name for clips in previous.values() for name in clips.values()} - retained:
        if re.fullmatch(r"(en|tr)-\d+-[0-9a-f]{10}\.mp3", name):
            (assets / name).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
