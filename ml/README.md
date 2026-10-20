# ml

Training and export for the Bird Eye v33 detector.

## What the notebook does

`notebooks/train_rdd2022.ipynb` runs in Google Colab.
1. Downloads RDD2022 (13.3 GB), checks its MD5, extracts the 7 inner country zips and keeps the included countries (see below).
2. Converts the labels to 2 classes and YOLO format, with images shrunk to 640 px.
3. Splits off about 10% of each country as val, in blocks of 100 consecutive images, saved to Drive so it never changes.
4. Trains YOLO11n with Ultralytics, saving `last.pt` to Drive every epoch.
5. Validates, exports a float16 TFLite model, checks it against PyTorch on 20 images and writes a JSON report.

## Run modes

| `RUN_MODE` | What it does | Use it for |
|---|---|---|
| `smoke` | No dataset, no training. Builds YOLO11n with 2 classes and random weights and exports it. Writes `birdeye_smoke_random_float16.tflite`. | Testing model loading, tensor shapes, decoding and phone speed today. Shape and speed do not depend on training. **Detections from this file are meaningless.** The report says `"weights": "random, not for detection"`. |
| `quick` | 10% of the training data, 3 epochs. | Proving the pipeline end to end. |
| `full` | All data, 30 epochs. | The real model. |

## How to run in Colab

1. Open the notebook in Colab (upload it, or open it from GitHub).
2. Runtime > Change runtime type > pick a GPU.
3. In cell 1 set `RUN_MODE`. Run `"smoke"` first, then `"quick"`, then `"full"`.
4. Runtime > Run all. Allow the Drive prompt (cell 1 mounts Drive).

The first `quick` or `full` run needs about 40 GB of free disk on `/content`.

## RDD2022 layout

Confirmed on 19 Oct from the zip listings and the first Colab run. The outer zip holds `RDD2022/<Country>.zip` for 7 countries. Inside each inner zip every entry starts with `<Country>/`:
- `<Country>/train/images/*.jpg`
- `<Country>/train/annotations/xmls/*.xml` (one XML per train image)
- `<Country>/test/images/*.jpg` (**the test split has no annotations**)

`China_Drone` has a train folder only. Cell 4 extracts every inner zip into `/content/rdd2022_raw/<Country>/`, checks the jpg and xml counts against the zip listing, writes a marker `.extracted_<Country>` and deletes the inner zip to free space. The last marker is `.inner_extracted_v2`. If the inner zips are already on disk, nothing is downloaded again. Images and XMLs are matched by file stem. Test images are never converted or copied, because they have no labels.

| Country | Train images | Test images |
|---|---|---|
| China_Drone | 2401 | none |
| China_MotorBike | 1977 | 500 |
| Czech | 2829 | 709 |
| India | 7706 | 1959 |
| Japan | 10506 | 2627 |
| Norway | 8161 | 2040 |
| United_States | 4805 | 1200 |

Norway's inner zip is 10.6 GB; the others are 0.16 to 1.1 GB.

## Country filter

`EXCLUDE_COUNTRIES = ["China_Drone"]` in cell 1. Reason: drone images are top down, and the patrol phone looks forward through a windscreen. `China_MotorBike` is kept. Cell 5 still lists every country and marks the excluded ones. If an excluded name matches no folder, cell 5 prints a warning with the real folder names.

## Block split

Per country, the train images are sorted by file name and cut into blocks of 100 consecutive images. Whole blocks go to val, picked with the seed, until val is about 10% of that country (`SPLIT_METHOD = "blocks100"`). Reason: consecutive frames can look alike, so a random per-image split could put near duplicates in both train and val and inflate mAP. It is not known whether file numbers follow capture order, so a block may not be one stretch of road; the split is still safer than a per-image one. The split method is part of the cache hash, so an older cache is never reused.

## Cache hash

One hash names the cache, the split file and the report. It is computed in cell 1 as `SETTINGS_HASH`, together with `TAR_PATH` and `SPLIT_FILE`, so re-running cell 1 updates all three, and cells 4 and 7 only use those names. The cache is `cache/rdd2022_yolo_<hash>.tar`, the split is `splits/split_<hash>.json`, and the report has `settings_hash`, `cache_file` and `split_file`. The hash covers the class mapping, `DROP_CODES`, `EXCLUDE_COUNTRIES`, the image size, the seed, the val fraction and the split method. A cache built with other settings is ignored, never reused. The tar also holds `build_settings.json`, which cell 4 compares with the current settings after extracting.

If there is no matching cache and no raw data, cell 4 stops with a message that lists the cache files on Drive. It downloads the 13 GB only if `FORCE_DOWNLOAD = True` in cell 1.

Earlier versions of the notebook defined the tar name in cell 4 and the split name in cell 7. Re-running cell 1 after cell 4 gave the two files different hashes. If a tar and a split on Drive have different hashes, rename the tar to the split's hash only after checking that the tar's `build_settings.json` matches the settings.

## Model version

For `quick` and `full` the version is `m-<date>-<RUN_MODE>`, for example `m-2026-10-19-full`; `smoke` uses `m-<date>`. The first time cell 1 runs for a mode, it writes `model_version_<RUN_MODE>.json` on Drive. Later runs read it, so a resume on another day keeps the same version. An existing file is read as it is and never rewritten, so a file from before this rule keeps its old version. Delete the file to get a new version. The same string is used in the file names and in the report.

## Resume after a disconnect

Reconnect with the GPU runtime, keep the same `RUN_MODE` and run all again.
- The dataset comes back from the Drive cache, skipping the download. If the conversion was cut off, it continues where it stopped.
- Cell 8 prints one of three cases. **No `last.pt`:** fresh run. **Unfinished run:** resumes from `last.pt`. **Finished run:** skips training and uses `best.pt`.
- A run counts as finished by Ultralytics' own rule (8.4.182, `engine/trainer.py`): it can resume only if `0 < epoch + 1 < epochs`, and at the end of training the `epoch` field in `last.pt` is set to -1.

## Outputs on Drive

All under `MyDrive/birdeye_ml/`:

| Path | Content |
|---|---|
| `model_version_<mode>.json` | The fixed model version |
| `cache/rdd2022_yolo_<hash>.tar` | The converted dataset |
| `runs/<quick or full>/` | Ultralytics run: `weights/last.pt`, `weights/best.pt`, `results.csv` |
| `splits/split_<hash>.json` | The saved train and val lists |
| `exports/birdeye_<version>_<mode>_float16.tflite` | The model (`birdeye_smoke_random_float16.tflite` for smoke) |
| `exports/report_<version>_<mode>.json` | Metrics, counts, versions and the TFLite conventions |
| `exports/sanity_<n>.jpg` | 3 overlays: ground truth blue, PyTorch green, TFLite red (`sanity_smoke_<n>.jpg` for smoke) |

## Class mapping

| RDD2022 code | Meaning | Bird Eye class | Index |
|---|---|---|---|
| D40 | pothole | pothole | 0 |
| D00 | longitudinal crack | crack | 1 |
| D10 | transverse crack | crack | 1 |
| D20 | alligator crack | crack | 1 |
| anything else | | dropped | |

The notebook lists the dropped codes explicitly (`DROP_CODES` in cell 1): D01, D0w0, D11, D43, D44, D50, Repair and Block crack. Any code in neither list stops cell 5. D0w0 was added on 19 Oct: 1 box, India only.

### Class balance

In the 6 active countries there are 45,481 crack boxes and 6,458 pothole boxes. India supplies 3,187 of the potholes. The pothole val sample is small, so its mAP is noisy.

## Versions

| Package | Pin | Confirmed in Colab (smoke run, 19 Oct) |
|---|---|---|
| python | Colab's own | 3.13.15 |
| torch | Colab's own, not pinned | 2.11.0+cu130 (CUDA 13.0) |
| ultralytics | 8.4.182 (latest on PyPI, 2026-10-19) | 8.4.182 |
| model | yolo11n.pt | |
| numpy | Colab's own, not pinned | |
| tensorflow | installed by the export, not pinned | 2.21.0 |
| onnx | installed by the export, not pinned | 1.23.2 |
| onnx2tf | installed by the export, not pinned | 2.3.15 |
| onnxslim | installed by the export, not pinned | 0.1.98 |
| onnxruntime | installed by the export, not pinned | 1.31.0 |
| ai-edge-litert | installed by the export, not pinned | 2.3.0 |

No runtime restart was needed for the export on the Colab image of 19 Oct.

The numpy cell is blank on purpose. In the smoke run cell 2 printed numpy 2.1.3 while the report said 1.26.4, so the version loaded in the running process and the installed version differ. Cells 2 and 10 now print both for every key package, with a warning when they differ, and the report stores both (`package_versions`, `package_versions_before_export`). Fill in numpy from the next run.

## Export route

In Ultralytics 8.4.182, `format="tflite"` is deprecated and becomes `format="litert"`, which writes a float32 model, and `half=True` is a deprecated alias of `quantize=16`, which the TensorFlow formats reject. So the notebook uses `format="saved_model"` (ONNX, then onnx2tf), which writes both a float32 and a float16 `.tflite`, and keeps the float16 one. It checks that the float16 file is clearly smaller than the float32 one. No NMS is added.

## Expected TFLite output

For 2 classes at 640 px the output is `[1, 6, 8400]`.
- 6 = 4 box values + 2 class scores (pothole, crack).
- 8400 = candidate boxes: $80^2 + 40^2 + 20^2 = 6400 + 1600 + 400$, one per cell on the stride 8, 16 and 32 grids.

There is no NMS in the file, so the app must filter by score and remove overlapping boxes itself.

## TFLite conventions

Cell 11 does not assume these. It runs 20 images through the TFLite file and through PyTorch with the same preprocessing, and decides from the numbers. The report JSON (`tflite_conventions`) holds the answers and the evidence:

| Item | Report field | How it is decided |
|---|---|---|
| Input shape, dtype, layout (NHWC or NCHW) | `input.shape`, `input.dtype`, `input.layout` | From the interpreter |
| Channel order (RGB or BGR) and pixel range (0 to 1 or 0 to 255) | `input.channel_order`, `input.pixel_range` | All 4 combinations are run; the one whose top score matches PyTorch's wins |
| Output shape and layout | `output.shape`, `output.layout` | Which axis has size 4 + classes |
| Box format (centre x, centre y, width, height, or corners) | `output.box_format` | Which format gives the best IoU with PyTorch's top box |
| Boxes normalised or in pixels | `output.box_values` | Maximum box value over all 20 images |
| Scores: probabilities or logits | `output.scores` | Min and max over all scores |
| TFLite vs PyTorch agreement | `tflite_vs_pytorch` | Same class and every coordinate within 5 px, after clipping the TFLite box to the image frame |

Ultralytics clips its boxes to the image frame, so the check clips the TFLite box to [0, 640] before the IoU and the coordinate difference (`clipped_before_compare: true`). The app must clip too. The cell prints the raw, clipped and PyTorch boxes on separate lines. The box format is decided from the clipped IoU, and counts as decided above 0.8.

If a field says it was not decided from the data, the check was ambiguous; read the evidence fields before trusting it. In `smoke` mode the PyTorch comparison still runs, but its detections are noise.

## Preprocessing and the inverse mapping

The app must letterbox the camera frame the way Ultralytics does. This is the rule from the 8.4.182 source (`data/augment.py`, `LetterBox`, used by `predict`), and cell 11 uses it for both TFLite and PyTorch. Top-left padding was used in the earlier notebook; the source default is centred, so it was changed.

1. `scale = 640 / max(width, height)`. Scaling up is allowed. (Ultralytics val uses `scaleup=False`; the two differ only for images with a longest side below 640.)
2. `new_w = round(width * scale)`, `new_h = round(height * scale)`. Resize with bilinear interpolation (`cv2.INTER_LINEAR`).
3. Centre it on a 640 x 640 canvas filled with 114: `pad_x = round((640 - new_w) / 2 - 0.1)` and `pad_y = round((640 - new_h) / 2 - 0.1)` are the left and top padding.
4. Channel order and pixel range: see the report (`tflite_conventions.input`).

Inverse mapping, from model pixels to the original image:

$$x_{original} = \frac{x - pad_x}{gain_x}, \qquad y_{original} = \frac{y - pad_y}{gain_y}$$

with $gain_x = new\_w / width$ and $gain_y = new\_h / height$ (both about equal to `scale`). **Clip to $[0, width] \times [0, height]$ after this mapping**, as Ultralytics `scale_boxes` does. Clipping to $[0, 640]$ before the mapping is not enough, because it keeps boxes that reach into the padding. The cell-11 comparison with PyTorch clips to $[0, 640]$ only because its "original" image is the 640 x 640 canvas.

The report records all of this in `tflite_conventions.preprocessing`, with the numbers for the first test image. Cell 11 also maps the TFLite box back to the original image and compares it with PyTorch's own mapping on the unpadded image (`mapped_back_to_original`); that check differs in padding (Ultralytics pads to a multiple of 32), so treat it as a sanity check.

## Metric note

The RDD2022 test split has no labels (confirmed 19 Oct from the zip listings). So mAP is measured on val, which is held-out blocks of RDD2022 train (about 10% per country, blocks of 100 consecutive images), not an official test split. RDD2022 has no Malaysian images, so no accuracy is claimed for Malaysian roads.

## Results

The full run (30 epochs, `m-2026-10-19-full`) is in [results/full/RESULTS.md](results/full/RESULTS.md): metrics, setup, per-epoch table, limits and file list, with the report JSON, `results.csv`, curves and confusion matrices next to it. The executed notebook is `notebooks/runs/train_rdd2022_full_m-2026-10-19-full.ipynb`. The `.tflite` and `.pt` files are not in git; they stay on Drive.
