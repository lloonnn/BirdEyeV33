# Bird Eye v33: Questions and answers

For teammates rehearsing for judges, and for mentors. Answers follow [architecture.md](architecture.md). Where an answer and that doc disagree, the doc wins; fix this file.

## Product

**How is this different from someone reporting potholes with an app?**
Nobody has to notice, remember or report anything. Phones in patrol vehicles inspect the roads as a side effect of routine driving, so defects are found without waiting for a complaint. The system also tracks each defect across many passes, which a one-off report cannot do. Confirming a repair from later passes is built, but clean passes have no real source yet.

**Commercial products like Vialytics and RoadBotics already do this. Why build it?**
The idea is proven abroad, and we concede that Vialytics detects far more: 15 damage classes against our 2. Vialytics (Germany, founded 2018) mounts a smartphone in municipal vehicles, photographs the road every 4 m, uploads the images over WiFi, analyses them on its servers and manages work orders; its App Store listing claims more than 600 municipalities, and it announced a US alliance with Colliers in February 2026. RoadBotics was acquired by Michelin in July 2022. Our difference is narrower: detection runs on the phone and only defect crops leave it; repair confirmation from later passes is designed in, which we have not seen Vialytics advertise (that is not proof they lack it); and it is built for Malaysian townships, where we found no Vialytics deployment.

*Sources: vialytics.de; Vialytics App Store listing (apps.apple.com); technical.ly (RoadBotics).*

**Who pays, and who owns the roads after handover to the council?**
SDP's township operations team is the main user and payer, because SDP maintains the roads until handover. After handover the council owns the roads and SDP's reason to pay ends, so scale beyond handover depends on the council joining. A council data handover and an escalation agent that drafts council reports are future work, not part of this build.

**Why only potholes and cracks?**
The maintenance team needs fix-first decisions, not crack types, and RDD2022, our training dataset, labels both. Drains, street lights, fallen trees and illegal dumping need their own labelled images, and no public dataset labels drain defects. They are future work.

## Accuracy and data

**How accurate is the model on Malaysian roads?**
We do not know yet, and we do not claim a number. The model is trained on RDD2022 only, which has no Malaysian images, so local accuracy will probably be lower than on RDD2022's own test split. The pilot's shadow run measures it: the team checks every detection against the road, and those checks become the first local labels.

**What happens with wet roads and puddles in the monsoon?**
We do not know yet. A puddle may hide a pothole or be mistaken for one, and the model has not been tested on wet Malaysian roads. Unsure detections go to a supervisor's review queue instead of becoming defects, and rejected detections become negative training examples. We will find out how often this happens in the pilot's shadow run, where every detection is checked.

**Phone GPS is only accurate to a few metres, and you merge at 8 m. Does that break merging?**
It can, and the 8 m radius is a starting value, to be tuned in testing, not a tested number. GPS.gov says smartphones are typically accurate to within 4.9 m under open sky, and worse near buildings and trees; the distance-ahead estimate adds its own error. One thing helps: each defect's position is the average of all its sightings, which is more precise than any single reading. The opposite risk is real too: two potholes a few metres apart may merge into one defect, which testing must check.

*Source: gps.gov.*

## System

**What if someone uploads false detections?**
The hackathon build has no authentication, so in principle anyone who can reach the server could upload. A single bad record still cannot create a verified defect: a defect becomes Verified only after sightings on 3 passes, or a supervisor's approval, and every crop is visible for checking. In a rollout, each phone gets its own key, so the server rejects uploads from unregistered phones and a lost phone's key can be switched off.

**How do you know a repair actually held?**
After a job is marked done, the defect is confirmed only after 3 clean passes on at least 2 different days. Clean passes are recorded only through a dev endpoint today. There is no real source yet, so no repair is confirmed from real driving.

**What if the phone overheats?**
The app does not handle heat yet. It has no thermal manager, so it keeps scanning at the same rate.

**What if there is no mobile signal?**
Detection runs fully on the phone, so it keeps working offline. Records wait in a local database on the phone, which survives a crash or reboot, and upload in batches when signal returns, with retries.

## People and privacy

**Will guards feel watched?**
The system computes no driver performance metrics. It uploads no GPS tracks and no heartbeats.

**Do you record residents' faces or number plates?**
No video is stored or uploaded; each frame is analysed in memory and discarded. Only a crop of the defect leaves the phone. Face and plate blur is not built, so a crop can show faces and plates.

**Do drivers touch the phone while driving?**
No. The driver taps once on the Start shift screen, and the app runs on its own after that.

## Agents

**Can the AI agents make mistakes or act on their own?**
They can make mistakes, but they cannot act on their own. Agents run only when someone starts them. They only save drafts; they have no tool that sends anything outside the system or changes a defect's status, and a supervisor approves, edits or rejects every work order. A brief must list the defect IDs it cites. Every agent run and tool call is logged.

## Cost and scale

**What does it cost per vehicle, upfront and per month?**
Upfront, a mid-range Android phone is about RM600 to RM800 and a mount and car charger about RM50 to RM100, so a 10-vehicle pilot is roughly RM8,000. These are proposal estimates to check before the pitch. The monthly running cost is an estimate to verify: mobile data should be small because only kilobyte records are sent, and server hosting for a pilot is not yet costed.

**Does it scale to other SDP townships?**
Technically yes: one backend can serve every township, with a small retraining effort per township. SDP's own company profile lists around 25 active townships and developments. The main limits are organisational: whether the maintenance team can act on more detected defects, and the handover of roads to the council.

## Project

**Did you use AI tools?**
Yes. We used Claude in design and coding, and we disclose it as clause 13.1 of the hackathon terms requires. Commits made with Claude Code carry a Co-Authored-By trailer, which is the record.
