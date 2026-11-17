"""Collect notes and send a digest."""

# run by cron at 07:00

def daily_digest():
    """Run the fetcher, then summarise."""

TIMEOUT_MINUTES = 10

def run():
    notes = fetcher.run()
    digest = summarise(notes)
