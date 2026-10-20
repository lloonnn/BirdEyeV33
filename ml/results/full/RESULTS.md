# Full run results: m-2026-10-19-full

All numbers below are read from `report_m-2026-10-19-full_full.json` and `results.csv` by a script, not typed by hand.

## Metrics on the val set

| Class | mAP@0.5 | Val boxes |
|---|---|---|
| pothole | 0.4245 | 624 |
| crack | 0.5576 | 4790 |
| all | 0.4910 | 5414 |

Overall mAP@0.5:0.95 is 0.2357. Overall precision is 0.5554 and overall recall is 0.4663 at the last epoch (from `results.csv`). Precision and recall per class are not in the report or in `results.csv`, so they are not listed. The curves are in the PNG files.

## Setup

- Model: YOLO11n, weights `yolo11n.pt` as the start.
- Ultralytics: 8.4.182.
- Epochs: 30 of 30.
- Image size: 640.
- Classes: 0 = pothole, 1 = crack.
- Excluded country: China_Drone (top down drone images; the phone looks forward).
- Split method: blocks100 (blocks of 100 consecutive images per country, about 10% to val).
- Train: 32284 images, 5834 pothole boxes, 40690 crack boxes, 12724 background images.
- Val: 3700 images, 624 pothole boxes, 4790 crack boxes, 1412 background images.
- Settings hash: bdb7a279.

## mAP@0.5 per epoch

| Epoch | mAP@0.5 | mAP@0.5:0.95 | Precision | Recall |
|---|---|---|---|---|
| 1 | 0.1047 | 0.0405 | 0.3254 | 0.1463 |
| 2 | 0.1398 | 0.0544 | 0.2591 | 0.1902 |
| 3 | 0.0924 | 0.0355 | 0.1838 | 0.1504 |
| 4 | 0.1591 | 0.0622 | 0.2676 | 0.2239 |
| 5 | 0.2067 | 0.0819 | 0.3379 | 0.2664 |
| 6 | 0.2596 | 0.1037 | 0.3690 | 0.3090 |
| 7 | 0.2657 | 0.1164 | 0.3953 | 0.2968 |
| 8 | 0.2901 | 0.1245 | 0.3788 | 0.3129 |
| 9 | 0.3127 | 0.1364 | 0.4005 | 0.3473 |
| 10 | 0.3320 | 0.1450 | 0.4440 | 0.3477 |
| 11 | 0.3393 | 0.1510 | 0.4859 | 0.3444 |
| 12 | 0.3599 | 0.1643 | 0.4513 | 0.3821 |
| 13 | 0.3796 | 0.1693 | 0.4929 | 0.3770 |
| 14 | 0.3948 | 0.1752 | 0.5065 | 0.3942 |
| 15 | 0.4103 | 0.1854 | 0.5168 | 0.4134 |
| 16 | 0.4138 | 0.1907 | 0.5117 | 0.4099 |
| 17 | 0.4210 | 0.1937 | 0.4899 | 0.4245 |
| 18 | 0.4369 | 0.1988 | 0.5250 | 0.4329 |
| 19 | 0.4377 | 0.2043 | 0.5327 | 0.4202 |
| 20 | 0.4514 | 0.2113 | 0.5335 | 0.4381 |
| 21 | 0.4536 | 0.2136 | 0.5404 | 0.4354 |
| 22 | 0.4602 | 0.2166 | 0.5376 | 0.4412 |
| 23 | 0.4671 | 0.2211 | 0.5404 | 0.4525 |
| 24 | 0.4733 | 0.2239 | 0.5631 | 0.4437 |
| 25 | 0.4789 | 0.2289 | 0.5728 | 0.4437 |
| 26 | 0.4828 | 0.2304 | 0.5606 | 0.4541 |
| 27 | 0.4847 | 0.2327 | 0.5475 | 0.4637 |
| 28 | 0.4857 | 0.2339 | 0.5454 | 0.4637 |
| 29 | 0.4896 | 0.2349 | 0.5668 | 0.4601 |
| 30 | 0.4913 | 0.2351 | 0.5554 | 0.4663 |

The best epoch by mAP@0.5 is epoch 30 (0.4913).

## Interruption

Training stopped once after epoch 23 and was resumed from `last.pt` at epoch 24, so all 30 epochs ran. `args.yaml` shows `model` pointing at `last.pt`, which is what a resume writes.

## Limits

- Val is held-out blocks of RDD2022 train, not a test split. Reason: the RDD2022 test split has no labels.
- No accuracy is claimed for Malaysian roads. Reason: RDD2022 has no Malaysian images.
- The pothole sample is small: 624 val boxes. Reason: a few boxes move the pothole mAP a lot, so it is noisy.
- Near duplicate frames may be in both train and val. Reason: the block split only helps if file numbers follow capture order, which is not known.
- Speed on the phone is not measured. Reason: no phone test has been run yet.

## Confidence note

Scores are low. The F1 curve (`BoxF1_curve.png`) peaks near a confidence of 0.20, read off the plot. Reason: a threshold far above that point would drop many true detections. The app's score threshold is a config value, so it can start near 0.20 and be tuned.

## Files

| File | Size (bytes) |
|---|---|
| `BoxF1_curve.png` | 140780 |
| `BoxPR_curve.png` | 155466 |
| `BoxP_curve.png` | 130880 |
| `BoxR_curve.png` | 147973 |
| `args.yaml` | 1803 |
| `confusion_matrix.png` | 134085 |
| `confusion_matrix_normalized.png` | 127762 |
| `report_m-2026-10-19-full_full.json` | 5900 |
| `results.csv` | 4879 |
| `../../notebooks/runs/train_rdd2022_full_m-2026-10-19-full.ipynb` (executed notebook) | 119061 |

The `.tflite` model and the `.pt` weights are not in git. They stay on Drive (`exports/` and `runs/full/weights/`). Reason: model files are large build outputs.
