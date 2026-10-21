# Bird Eye v33: Questions and answers

## Product

**How is this different from someone reporting potholes with an app?**
- Nobody has to notice, remember or report anything. Phones in patrol vehicles inspect the roads as a side effect of routine driving, so defects are found without waiting for a complaint.  If a patrol car sees the same pothole on three different days, the system shows one pothole that was seen three times. A single complaint cannot show that. After a repair, the system can check it later by watching whether patrol cars still see the pothole. That check is built, but only tested with hard coded data so far.

**Who pays, and who owns the roads after handover to the council?**
- SDP's township operations team is the main user and payer, because SDP maintains the roads until handover. After handover the council owns the roads and SDP's reason to pay ends, so scale beyond handover depends on the council joining. A council data handover and an escalation agent that drafts council reports are future work, not part of this build.

**Why only potholes and cracks?**
- The maintenance team needs fix-first decisions, not crack types, and RDD2022, our training dataset, labels both. Drains, street lights, fallen trees and illegal dumping need their own labelled images, and no public dataset labels drain defects. They are future work.

## Accuracy and data

**How accurate is the model on Malaysian roads?**
- We do not know yet, and we do not claim a number. The model is trained on RDD2022 only, which has no Malaysian images, so local accuracy will probably be lower than on RDD2022's own test split. The pilot's shadow run measures it: the team checks every detection against the road, and those checks become the first local labels.

**What happens with wet roads and puddles in the monsoon?**
- We do not know yet. A puddle may hide a pothole or be mistaken for one, and the model has not been tested on wet Malaysian roads. Unsure detections go to a supervisor's review queue instead of becoming defects, and rejected detections become negative training examples. We will find out how often this happens in the pilot's shadow run, where every detection is checked.

*Source: gps.gov.*

## System

**What if the phone overheats?**
- The app does not handle heat yet. It has no thermal manager, so it keeps scanning at the same rate.

**What if there is no mobile signal?**
-  Detection runs on the phone, so it keeps working with no signal and saves it on the phone. If the app crashes or the phone restarts, the saved detections are still there. When the signal comes back, the phone sends them to the server in groups. If a send fails, it tries again later.

## People and privacy

**Will patrollers feel watched?**
- The system computes no driver performance metrics. It uploads no GPS tracks and no heartbeats.

**Do you record residents' faces or number plates?**
- No video is stored or uploaded; each frame is analysed in memory and discarded. Only a crop of the defect leaves the phone. Face and plate blur is not built, so a crop can show faces and plates.

**Do drivers touch the phone while driving?**
- No. The driver taps once on the Start shift screen, and the app runs on its own after that.

## Cost and scale

**What does it cost per vehicle, upfront and per month?**
- Upfront, a mid-range Android phone is about RM600 to RM800 and a mount and car charger about RM50 to RM100, so a 10-vehicle pilot is roughly RM8,000. These are proposal estimates to check before the pitch. The monthly running cost is an estimate to verify: mobile data should be small because only kilobyte records are sent, and server hosting for a pilot is not yet costed.

**Does it scale to other SDP townships?**
- Technically yes: one backend can serve every township, with a small retraining effort per township. SDP's own company profile lists around 25 active townships and developments. The main limits are organisational: whether the maintenance team can act on more detected defects, and the handover of roads to the council.
