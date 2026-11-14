---
name: pondering
description: Thinks an idea through with the user before it becomes work - reads what they are pondering, asks focused questions until the full picture is clear, and when they say "Dump 'em out" writes it up as a task on their GitHub Projects Kanban board (ViliusZur project 1). Use whenever the user says "Pondering" (also "I'm pondering", "let's ponder", "ponder this"), runs /pondering, or says "Dump 'em out" (also "dump them out", "dump it out") after pondering something.
argument-hint: "[what you're pondering]"
---

# Pondering

The user says "Pondering" when they have an idea, problem or piece of work that is still fuzzy.
Your job is to help them get it out of their head and into a task someone could pick up later,
including Claude in a fresh session with none of this conversation. Two phases: ask until the
picture is clear, then, on "Dump 'em out", put it on the board.

## 1. Ponder: read, then ask

Read everything they wrote after "Pondering". If they said only "Pondering", ask what is on
their mind and wait.

Then ask the questions that would most change what the task says. Good areas, depending on the
idea (not a checklist to run through):

- **Why**: what problem this solves or what prompted it.
- **What done looks like**: how they'll know it is finished; what someone would see or be able
  to do.
- **Scope**: what is in, what is deliberately out, and the smallest useful version.
- **Constraints**: deadlines, dependencies on other work, tech or design limits.
- **Priority**: how it compares to whatever else is on the board.
- **Unknowns**: anything that needs checking or deciding before work can start.

How to ask:

- Ask 2-4 questions at a time, most important first, numbered so they can answer by number.
  A wall of questions makes the user do the structuring, which is your job.
- Ask in plain chat. Answers here are open-ended, so multiple-choice prompts get in the way.
  Offer options only when the choice really is between a few known alternatives.
- Build on each answer. Don't re-ask what they already said, and don't ask things you can find
  out yourself (look at the codebase or the board instead).
- If an answer opens up something big, follow it. If it opens up a separate idea, note it as a
  possible second task rather than letting it take over.
- When you think the picture is complete, say so in a sentence with a one-line summary of the
  task, and tell them to say "Dump 'em out" or keep adding.

While pondering, only think and ask. Don't write code, edit files or create tasks yet; the user
hasn't decided what the work is.

## 2. Dump 'em out: create the task

"Dump 'em out" is the go-ahead to create the task. Do it without asking again.

If they say it before the picture is complete, create the task anyway with what you know and
list the unanswered questions under "Open questions". If nothing was pondered in this
conversation, say there is nothing to dump and stop.

### How many tasks

Usually one. If the pondering turned up separate pieces of work that would each be done and
finished on their own, create one task per piece, each readable without the others.

### Write the task

- **Title**: imperative, specific, at most about 70 characters ("Add offline sync for notes",
  not "Sync").
- **Body**: Markdown, written for someone who wasn't in the conversation. Use these sections and
  drop any that would be empty:

  ```markdown
  ## Goal
  <One or two sentences: what this achieves and why it matters.>

  ## Context
  <What prompted it, background, related work or files.>

  ## Details
  - <Requirements, behavior, scope; what's in and what's out>

  ## Decisions
  - <Choices made while pondering, with the reason>

  ## Open questions
  - <Anything still unanswered>

  ## Done when
  - <Concrete checks that show it is finished>
  ```

### Put it on the board

The board is the user's GitHub project number 1, owner `ViliusZur`
(https://github.com/users/ViliusZur/projects/1). Tasks go on as draft items in the Todo column.

1. Look up the ids (they don't change often, but read them rather than hard-coding them):

   ```bash
   gh project view 1 --owner ViliusZur --format json --jq .id
   gh project field-list 1 --owner ViliusZur --format json \
     --jq '.fields[] | select(.name=="Status") | {id, todo: (.options[] | select(.name=="Todo") | .id)}'
   ```

2. Create the draft item and keep its `id`:

   ```bash
   gh project item-create 1 --owner ViliusZur --format json --jq .id \
     --title "<title>" \
     --body "$(cat <<'EOF'
   <body>
   EOF
   )"
   ```

3. Put it in Todo:

   ```bash
   gh project item-edit --id <item id> --project-id <project id> \
     --field-id <status field id> --single-select-option-id <todo option id>
   ```

If `gh` says the token is missing the `project` scope, ask the user to run
`gh auth refresh -s project` and say "Dump 'em out" again. Show them the drafted title and body
so nothing from the pondering is lost.

## 3. Report

A few lines: each task's title, that it is in Todo, and the board link. Mention any open
questions left in the task. The pondering ends here; a new "Pondering" starts fresh.
