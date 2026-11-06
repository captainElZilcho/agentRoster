"""Support helper."""
import os
import anthropic

client = anthropic.Anthropic()

def ask(question):
    return client.messages.create(model="m", max_tokens=1, messages=[])
