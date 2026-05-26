# Implementation Plan

## 🎯 Objectives:

- Finalize the document conversion workflow for incoming clinical documents so they are correctly classified and routed within Genie.
- Prioritize correct patient details and document destination over over-segmentation of subtype labels such as letter versus referral.
- Support reception and administration staff with a practical triage process for mixed inbox content, including manual review for uncertain items.
- Maintain doctor and provider-number mappings in the converter so new clinicians can be added as staff change.
- Roll out the solution in a low-risk, reversible way, starting with fax processing before expanding to more complex email scenarios.

## 🗓️ Implementation Timeline:

- Current phase: Nicole Pyne will review the BJC consultant comments separately; the team did not discuss that document in detail during the meeting.
- Immediate next step: Sean O'Reilly will fix converter access so Nicole can add, edit, and delete doctors and provider numbers, and update any missing doctor mappings.
- Testing phase: continue live-example testing in the Genie environment, then run a dedicated full-day fax test once final tweaks are complete.
- Workflow confirmation: agree the inbox/folder-based triage process so reception can pre-sort documents before they reach the converter.
- Rollout sequence: start with fax processing first; treat multiple-attachment email handling and other edge cases as later-stage enhancements.
- Timeline note: no firm start date, end date, or go-live deadline was agreed.

## ✨ Key Initiatives:

**Document classification accuracy**

- Description: Test how the AI classifies incoming documents such as results, referrals, and letters across fax and email channels, using strong text cues like "Thank you for seeing" and similar referral indicators.
- Objective: Ensure documents are correctly identified and routed to the right place in Genie, with special focus on preventing results from being misdirected.
- Ownership: Sean O'Reilly and Nicole Pyne

**Routing to the correct Genie destination**

- Description: Confirm that documents land in the appropriate Genie queue or category, particularly pathology and radiology results versus correspondence items.
- Objective: Keep downstream handling reliable so clinical staff see documents in the correct queue and critical items are not misplaced.
- Ownership: Sean O'Reilly

**Doctor master data maintenance**

- Description: Enable updates to doctors and provider numbers in the converter, including upcoming additions such as Dr. Panglais and another doctor due in June.
- Objective: Keep document matching accurate as clinicians join or change, and reduce manual correction effort.
- Ownership: Nicole Pyne with configuration support from Sean O'Reilly

**Multiple attachment handling**

- Description: Define how emails with more than one attachment should be processed, treating separate documents independently when appropriate and providing fallback handling for partial conversion failures.
- Objective: Allow conversion of multiple documents from a single email without combining unrelated items into one record.
- Ownership: Sean O'Reilly

**Inbox triage folder workflow**

- Description: Shift human review earlier by having reception sort inbox items into a folder of documents ready for conversion that the converter watches.
- Objective: Reduce back-end exception handling and improve efficiency by only sending conversion-ready documents into the AI workflow.
- Ownership: Nicole Pyne and the reception team

**Confidence threshold fallback**

- Description: Consider a minimum AI confidence threshold so uncertain documents are left for human classification instead of being auto-processed.
- Objective: Reduce misclassification risk for difficult documents while preserving automation for high-confidence cases.
- Ownership: Sean O'Reilly

**Fax document conversion rollout**

- Description: Use the converter to process incoming fax documents first, with the initial scope focused on one document per fax.
- Objective: Automate fax handling reliably enough to support a live environment and reduce manual processing time.
- Ownership: Nicole Pyne, with configuration and support from Sean O'Reilly

**End-to-end validation testing**

- Description: Run a concentrated live-style validation using a full day of fax volume and confirm routing outcomes in Genie.
- Objective: Verify performance against real documents and determine whether the solution is ready for rollout.
- Ownership: Nicole Pyne

**Market solution scan**

- Description: Monitor the Digital Health Festival and other market options for document conversion solutions that could inform future enhancements.
- Objective: Keep the team aware of external alternatives for later phases or future improvement opportunities.
- Ownership: Nicole Pyne and Sean O'Reilly

## ⚠️ Challenges and Risks:

- AI may misclassify document type in edge cases, especially when document formats are ambiguous or inconsistent. Impact: incorrect routing or manual rework. Mitigation: use a confidence threshold and human review for uncertain items.
- Results must not be routed into the wrong Genie area. Impact: misplaced results could disrupt clinical workflow. Mitigation: prioritize results-versus-correspondence accuracy and verify with live tests.
- Letters and referrals are difficult to distinguish consistently, but the business impact is lower than misrouting results. Impact: minor classification noise. Mitigation: allow a simpler rule if both end up in the same Genie location.
- Multiple attachments in a single email may create partial-success scenarios where one PDF converts and another does not. Impact: some documents may still require manual intervention. Mitigation: treat attachments separately and keep a fallback human review path.
- Missing doctor entries or permission issues can prevent correct assignment and maintenance. Impact: delays in provider mapping updates. Mitigation: Sean O'Reilly to fix access and update the doctor list before go-live.
- The inbox contains mixed content and may require more manual triage if the folder workflow is not clearly defined. Impact: complex intake handling. Mitigation: introduce a reception-led pre-filtering step before conversion.
- Some documents such as password-protected files or spam are expected not to convert. Impact: these cases will still need manual handling. Mitigation: treat them as acceptable non-conversion cases and keep the existing workflow available.
- Real-world documents may behave differently from test cases. Impact: post-implementation adjustments may be needed. Mitigation: keep rollout low-risk and iterate quickly.

## 📌 Decisions Made:

- Nicole Pyne will review the BJC consultant comments separately; the team agreed not to spend meeting time on a detailed discussion of that document.
- The most important outcome is correct routing in Genie, not strict differentiation between letters and referrals when both land in the same destination.
- The team confirmed that current test examples were classified correctly for results, referrals, and letters.
- Human review remains part of the process, especially for referral routing and documents the AI cannot confidently classify.
- A confidence-threshold fallback may be used later if ambiguous documents become a problem, but no threshold change will be made now.
- Nicole should have permission to add, edit, and delete doctors and provider numbers in the converter, and Sean O'Reilly will fix access if needed.
- For emails with multiple attachments, each attachment should be treated as a separate document rather than combining them.
- The preferred workflow is for reception to pre-sort documents into a folder watched by the converter, reducing back-end exception handling.
- The rollout will start with fax processing, while more complex email edge cases will be addressed later.
- The implementation should remain reversible, with the existing manual process available as a fallback if needed.