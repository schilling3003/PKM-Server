---
name: loop
description: Run a prompt repeatedly on a fixed or self-paced interval within the current session. Usage - /loop [interval] <prompt>, /loop list, /loop clear, /loop stop. Based on Claude Code's /loop skill.
argument-hint: "[interval] <prompt> | list | clear | stop"
triggers:
  - user
---

# /loop — run a prompt repeatedly in this session

`/loop` runs a task repeatedly with a delay between iterations. It is an **in-session** loop: it keeps the current session busy until you send a new message, the session is interrupted, or the loop reaches a completion condition.

## Subcommands

If `$ARGUMENTS` (after stripping any leading `/loop` or `loop`) is exactly one of these keywords, handle it instead of scheduling:

- **`list`** — Explain that in-session `/loop` iterations are not tracked as separate jobs. To persist a loop across sessions, use Devin Automations (`devin_automation_manage`) or Schedules (`devin_schedule_manage`) instead.
- **`clear`** / **`stop`** — End the current loop immediately by summarizing what was done and confirming the loop has stopped. Do not schedule another `wait`.

## Parsing `$ARGUMENTS`

Strip any leading `/loop` or `loop` token from `$ARGUMENTS`, then parse the remainder in this priority order:

1. **Empty input** — run the **autonomous maintenance loop**.
2. **Leading interval token**: if the first whitespace-delimited token matches `^\d+[smhd]$` (e.g. `5m`, `2h`, `30s`, `1d`), use it as the interval. The rest is the prompt.
3. **Trailing "every" clause**: otherwise, if the input ends with `every <N><unit>` or `every <N> <unit-word>` (e.g. `every 20m`, `every 5 minutes`, `every 2 hours`), extract that as the interval and strip it from the prompt. Only match when what follows "every" is a time expression.
4. **Default**: the entire input is the prompt and this is the **self-paced** path.

If an interval is given but the prompt is empty (e.g. `/loop 5m`), run the **autonomous maintenance loop** on that fixed interval.

Examples:

- `5m check the deploy` → interval `5m`, prompt `check the deploy`
- `check the deploy every 20m` → interval `20m`, prompt `check the deploy`
- `run tests every 5 minutes` → interval `5m`, prompt `run tests`
- `check every PR` → self-paced, prompt `check every PR`
- `check the deploy` → self-paced, prompt `check the deploy`
- (empty) → autonomous maintenance loop
- `5m` → autonomous maintenance loop, interval `5m`

## Interval → seconds

Supported suffixes:

- `s` = seconds
- `m` = minutes
- `h` = hours
- `d` = days

Convert the interval to a number of seconds. Devin's `wait` tool has a maximum duration of 565 seconds (about 9.4 minutes). If the requested interval exceeds that:

- For an **in-session loop**, break the delay into multiple `wait` calls that sum to the interval (e.g. `30m` → six `wait` calls of 300 seconds).
- Prefer creating a **Devin Automation** for intervals longer than ~9 minutes or for loops that should survive session restarts. Use `devin_automation_manage` with a `schedule:recurring` trigger and a `start_session` action.

## Loop paths

### 1. Autonomous maintenance loop (no prompt)

Run this when no prompt is provided or when only an interval is provided.

On each iteration:

1. Look for any unfinished work in the current conversation and continue it.
2. If there is a PR for the current branch, tend to it: read new review comments, check CI status, resolve merge conflicts, and push minimal fixes. Do not start new initiatives.
3. If no PR work is pending, run a cleanup pass on recently changed files: look for small bugs, TODOs, hardcoded values, or simplifications.
4. Summarize what you did in one line.
5. Wait the chosen interval, then repeat.

Stop if you hit a condition that requires user input, an irreversible action not already authorized, or no useful work remains.

### 2. Fixed interval with prompt

Run this when an interval and a prompt were both parsed.

On each iteration:

1. Execute the prompt as if the user had just typed it. Use the appropriate tools (read, grep, exec, git_pr_checks, etc.) to act on it. If the prompt starts with `/`, strip the leading `/` and treat it as a task instruction or an attempt to invoke a matching skill by name.
2. Summarize the result in one or two lines.
3. Wait for the parsed interval (split into `wait` calls if it exceeds 565 seconds).
4. Repeat.

Stop if the prompt describes a completion condition that is now met, the task is blocked on user input, or no useful next check exists.

### 3. Self-paced with prompt (no interval)

Run this when a prompt is provided but no interval.

On each iteration:

1. Execute the prompt.
2. Summarize the result in one or two lines.
3. Choose a useful wait time between 60 and 300 seconds based on what you observed: short waits when a build/PR is active or nearly done, longer waits when quiet.
4. Wait, then repeat.

Stop when the task is complete, blocked on user input, or no useful next check exists.

## General rules

- Always call `wait` between iterations. Do not busy-loop.
- If the user sends a new message, the `wait` is cancelled and the loop stops naturally.
- Keep each iteration's summary concise; do not flood the transcript.
- For loops that must outlast this session or run on a cron, use `devin_automation_manage` to create a schedule-triggered automation instead of `/loop`.
