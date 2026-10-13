# ml/CLAUDE.md

Training and conversion for the Bird Eye v33 detector. Read `../docs/decisions.md` and section 8 of `../docs/architecture.md` first.

## Stack

- Python 3.14 (`.python-version`), uv, `src/` layout, `uv_build` build backend.
- A separate uv project from `../backend/`. Reason: the server never installs PyTorch.
- PyTorch for training. The model is converted once to TensorFlow Lite (LiteRT) to run on the phone with the GPU delegate.

Current state: the uv template only (`src/ml/__init__.py`, entry point `ml:main`), with no dependencies.

## Commands

Run from `ml/`.

```bash
uv sync              # create .venv and install dependencies
uv run ml            # run the template entry point (prints a greeting)
uv add <package>     # add a dependency; add a licence register row first
```

- Dataset preparation: not set up yet.
- Training: not set up yet.
- Evaluation: not set up yet.
- Conversion to LiteRT: not set up yet.
- Tests: not set up yet.

## Rules

- **Data:** RDD2022 only, 2 classes: pothole and crack. No local Malaysian data yet. Recorded local footage is for testing and the demo, not training.
- **Detector and conversion tool:** both undecided (you decide), pending the licence check. A candidate is YOLOX (Apache 2.0). No Ultralytics or other AGPL code. Reason: AGPL may conflict with the hackathon IP terms.
- **Evaluation gate:** the metric is mAP@0.5 per class (starting value). A retrained model is published only if it beats the current model on the fixed held-out set, per class. The first model has no current model and no local held-out set, so report its mAP@0.5 on RDD2022's own test split. If RDD2022 test labels are not public (verify), hold out a fixed slice of the training data and never train on it. Never claim accuracy on Malaysian roads.
- **Speed check:** after conversion, check the model runs at 3 frames a second on the cheapest team phone (starting value, to be tuned). A model that is accurate but too slow does not ship.
- **Version:** every converted model gets a version ID, which the phone reports in each sighting.
- **Git:** `ml/data/`, `ml/runs/`, `*.pt` and `*.onnx` are gitignored. Never commit datasets or weights. Reason: they are too large for git.
- `*.tflite` is gitignored too. The only committed model is the bundled fallback in `eagle/app/src/main/assets/`. Reason: other model files are large build outputs.
