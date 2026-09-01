# Weekly PAD Runtime Restart — Status & Learnings

**Status: ⚠️ PARKED (1 Sep 2026).** Task is registered on the BJC server but with a stale first version of the files; the fixed version lives in this branch (PR #25) and has not been re-tested live. Resume steps at the bottom.

Related: `docs/operations/pad-integration-guide.md` §14 (runbook), `scripts/pad-server/` (artifacts), `docs/operations/bjc-pdf-to-directory.md` "Shared-Server Scheduling".

---

## Why

Both PAD flows on `MHS-SYD-APP47` — `SMEC AI BJC PDF-to-directory` (PD@) and `SMEC AI BJC PDF-to-HL7` — have silently stopped after days of running while Task Scheduler kept reporting `(0x0)` (PD@ 19 Feb 2026; both flows 3 Aug 2026). A weekly hygiene restart of the PAD runtime is a mitigation, not a root-cause fix.

## Decisions (Sean, 1 Sep 2026)

| Decision | Choice | Why |
|---|---|---|
| Scope | Kill PAD console/robin/designer processes **and** restart the Power Automate Windows service | Service restart alone won't clear a hung flow run; a full reboot strands both flow tasks (they're "run only when user is logged on") until someone RDPs in as `medihost` |
| Run-as | `BJC\medihost`, highest privileges, run only when logged on | Matches the two flow tasks; `medihost` verified in local Administrators (`net localgroup Administrators`) |
| Schedule | **Saturday 03:07** weekly | 3 AM = empty mailboxes. `:07` sits between PD@'s `:05` and HL7's `:10` slots (PD@ fires :45/:55/:05/:15/:25/:35, HL7 :50/:00/:10/:20/:30/:40). Never a `:x5` or `:x0` minute. The flow tasks' load-bearing 5-min offset is untouched |
| Install location | Separate `C:\SMEC AI\scripts\` | Keeps ops tooling out of the flow's working dir `C:\SMEC AI\pdf-to-hl7\` (`convert.ps1`, `processed.log`, `token.dat`). Briefly considered sharing that folder; reverted |
| Deliverable | PowerShell script + importable Task Scheduler XML + runbook §14 | Medihost/Sean install over RDP; nothing in the app changes |

## What shipped (PR #25, branch `worktree-pad-weekly-restart`)

- `scripts/pad-server/Restart-PadRuntime.ps1` — elevation check → wait for `PAD.Robin.Host.exe` to be absent 20 s (max 4 min) → `Stop-Process` PAD console/robin/designer → `Restart-Service UIFlowService` → exit. Every failure exits non-zero (2 not elevated, 3 smoke fail, 4 no service, 5 not Running). `-SmokeRun` is manual-only.
- `scripts/pad-server/SMEC-AI-BJC-PAD-Weekly-Restart.xml` — Saturday 03:07, hidden window, 15-min limit, catch-up if missed, `IgnoreNew`.
- Guide §14: install, verification, exit-code table, encoding fix, "why no smoke run".

## Live test, 1 Sep 2026 14:05 — what actually happened

| Time | Event |
|---|---|
| 14:05:46 | Task launched by `schtasks /Run` as `BJC\medihost`, `elevated=True` |
| 14:06:09 | No flow run in progress → proceed |
| 14:06:12 | `PAD.Console.Host` killed (1); robin/designer not running |
| 14:06:12–16 | **Wrong service restarted**: `PADCrashMonitor` ("Power Automate crash monitor service", was Stopped) — see Learning 1 |
| 14:06:21 | Smoke: `Start-ScheduledTask 'SMEC AI BJC PDF-to-HL7'` → `PAD.Console.Host` back (PID 14452, StartTime 14:06:21) — **console self-relaunch confirmed** |
| 14:07:33 | PowerShell **terminated externally**, `LastTaskResult 3221225786` = `0xC000013A` (STATUS_CONTROL_C_EXIT). No `END` line logged — see Learning 2 |

Net effect of v1 as registered: console restart works; the real runtime service is *not* restarted; task shows a non-zero result.

## Learnings

1. **`DisplayName -like 'Power Automate*'` is not safe.** The box has six PAD services: `UIFlowService` ("Power Automate service" — the runtime), `UIFlowAgentLauncherService`, `UIFlowLogShipper`, `UIFlowUpdateService`, `PADCrashMonitor`, `PADJavaSyncService`. The wildcard picked the crash monitor first. Match `UIFlowService` by exact name (fixed in `ae97aed`).
2. **Something kills a `powershell.exe` that launched the HL7 flow, ~70 s later.** `0xC000013A` is the code for a console process closed/ctrl-broken, not a script error. The flow has **no Terminate-process step** (Sean checked) and `convert.ps1` has no kill logic. Unproven candidates: the crash-monitor service we accidentally *started* at 14:06:16 tidying "orphaned" processes; something closing console windows in the medihost session. Mitigation (`fed7835`): scheduled action runs `-WindowStyle Hidden` and exits right after the service restart (~30 s), never overlapping a flow run. If it recurs: `auditpol /set /subcategory:"Process Termination" /success:enable` and read Security event 4689 for the killer.
3. **Task Scheduler XML import is encoding-strict.** Copying the file via Notepad/RDP re-saved it UTF-16 while the declaration said UTF-8 → `(1,40)::ERROR: unable to switch the encoding`. Fix: `(Get-Content $p -Raw) -replace 'encoding="UTF-8"','encoding="UTF-16"' | Set-Content $p -Encoding Unicode` before `schtasks /Create /XML`. Baked into §14.
4. **`%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs` does not exist for `medihost`.** Don't build checks on it; use the PAD portal run history or process presence instead.
5. **Console kill is self-healing** — the flow tasks' `PAD.Console.Host.exe ms-powerautomate:/console/flow/run?…` action cold-starts the console. Verified 14:06:12 → 14:06:21.
6. **Ask before elevating on this box:** `net localgroup Administrators` from any admin prompt answers it; `whoami /groups` only tells you about the account you're currently running as.

## Current state on MHS-SYD-APP47

- Task `SMEC AI BJC PAD Weekly Restart` **is registered** (Saturday 03:07) with the **v1** script/XML from `C:\SMEC AI\scripts\`. Left as-is when parked; it will kill/relaunch the console weekly, restart the wrong service, and show `0xC000013A`. Harmless but not the fix. To pause: `schtasks /Change /TN "SMEC AI BJC PAD Weekly Restart" /DISABLE`.
- Files on the server are behind the branch by `ae97aed`, `fed7835`.

## Resume steps

1. Copy the current `scripts/pad-server/Restart-PadRuntime.ps1` and `SMEC-AI-BJC-PAD-Weekly-Restart.xml` from this branch to `C:\SMEC AI\scripts\` (overwrite).
2. Admin PowerShell:
   ```powershell
   $p = 'C:\SMEC AI\scripts\SMEC-AI-BJC-PAD-Weekly-Restart.xml'
   (Get-Content $p -Raw) -replace 'encoding="UTF-8"', 'encoding="UTF-16"' | Set-Content $p -Encoding Unicode
   schtasks /Create /F /TN "SMEC AI BJC PAD Weekly Restart" /XML $p
   schtasks /Run /TN "SMEC AI BJC PAD Weekly Restart"
   Start-Sleep 60
   Get-Content 'C:\SMEC AI\pad-restart.log' -Tail 10
   (Get-ScheduledTaskInfo 'SMEC AI BJC PAD Weekly Restart').LastTaskResult
   ```
   Expect `service UIFlowService ... status after=Running`, `END exit=0`, `LastTaskResult 0`. Avoid 12:40–13:00.
3. After the next `:x0` minute: `Get-Process PAD.Console.Host | Select-Object Id, StartTime` shows a console newer than the restart; both flow tasks' Last Run Time advance; a test fax files.
4. If `0xC000013A` again → Learning 2's audit steps.
5. Flip the ⚠️ row in guide §14's Pending table to ✅ with the date; merge PR #25.
