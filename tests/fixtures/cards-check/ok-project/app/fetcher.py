"""Fetcher: finds today's notes."""
# goal: every note written today
# never change a note
import anthropic

MODEL = "claude-sonnet-4-5"
MAX_TURNS = 5
SEARCH_NOTES = {
    "name": "search_notes", }
system = load_prompt("fetcher")

fetcher = Agent(
    model=MODEL,
    tools=[SEARCH_NOTES],
)
