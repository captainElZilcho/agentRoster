# Answers file v0.1 (draft)

Some card values are judgement calls. In v0.1 that is the card's `type`. When the skill is
unsure of its pick, it asks the user. The answers file, `agentroster.json` at the root of the
scanned project, keeps those answers so later runs use them and never ask again.

The file is JSON. Its schema is [`answers-file-0.1.schema.json`](../schema/answers-file-0.1.schema.json).

## Who writes it

The skill writes it only after the user says yes to saving the answers. It is the only file
the skill ever writes into a project. People may also edit it by hand, and teams can commit it
so everyone gets the same cards.

## The file

```json
{
  "agentroster": "0.1",
  "answers": [
    {
      "card": "triage",
      "field": "type",
      "value": "researcher",
      "reason": "It only looks things up; it writes nothing.",
      "date": "2026-11-18",
      "based_on": {"file": "crew_desk/crew.py", "line": 14, "quote": "goal=\"Sort each ticket by category and urgency\""}
    }
  ]
}
```

| Field | Values |
|---|---|
| `agentroster` | `"0.1"` |
| `answers` | A list, sorted by `card`, then `field`; one answer per `card` and `field` |
| `card` | The card id the answer is for |
| `field` | `"type"` (the only field open to asking in v0.1) |
| `value` | A type code from the [roster card standard](roster-card-standard-v0.2.md) |
| `reason` | Optional. Why, in a few words. Never a secret, never a person's name |
| `date` | When it was answered, `YYYY-MM-DD` (UTC) |
| `based_on` | Optional. The line the pick was based on: `file`, `line` (or `null`), `quote`, with any secret replaced by `[redacted]` |

No other keys are allowed in v0.1.

## How answers apply

- On every run, an answer sets that card's field as written. It counts as a person's word,
  like a value from a hand-written card: the card's evidence for the field starts with the
  answers file's `value` line, marked `found_by: "hand"`.
- A hand-written card (`<id>.roster.json`) that sets the same field wins over the answer, but
  the card still records the answer: its evidence lists the answers file's `value` line after the
  hand card, and the run notes the override.
- An answer for a card that no longer exists, or whose `based_on` line is no longer in its
  file, is kept and reported as stale, never dropped. When it can ask, the skill asks again,
  with the old answer as the default.
- Deleting an answer makes the next run ask again.
